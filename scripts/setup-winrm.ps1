<#
.SYNOPSIS
    Automated WinRM setup script for Windows Server with optional AD DS.

.DESCRIPTION
    Sets up WinRM with HTTP (5985) and HTTPS (5986) listeners, enables Basic and NTLM
    authentication, and optionally installs Active Directory Domain Services.
    
    Designed for AWS EC2 Windows instances - can be run via SSM Run Command,
    EC2 User Data, SSH, or RDP.

.PARAMETER InstallADDS
    Install Active Directory Domain Services and promote to Domain Controller.

.PARAMETER DomainName
    Domain name for AD DS (default: testdom.local)

.PARAMETER TestUserName
    Username for test account (default: winrmtest)

.PARAMETER TestUserPassword
    Password for test account (default: TestPassword123!)

.PARAMETER DSRMPassword
    Directory Services Restore Mode password (default: DSRMPassword123!)

.PARAMETER SkipHTTPS
    Skip HTTPS listener setup (only configure HTTP)

.PARAMETER InstallOpenSSH
    Install OpenSSH Server for SSH access

.EXAMPLE
    # Basic WinRM setup (HTTP + HTTPS, no AD)
    .\setup-winrm.ps1

.EXAMPLE
    # Full setup with AD DS
    .\setup-winrm.ps1 -InstallADDS

.EXAMPLE
    # Custom domain and credentials
    .\setup-winrm.ps1 -InstallADDS -DomainName "mytest.local" -TestUserPassword "SecurePass123!"

.EXAMPLE
    # Run via AWS SSM (wrap in PowerShell block)
    aws ssm send-command --document-name "AWS-RunPowerShellScript" --targets "Key=instanceids,Values=i-xxx" --parameters commands='[". { iwr -useb https://raw.githubusercontent.com/.../setup-winrm.ps1 } | iex"]'
#>

[CmdletBinding()]
param(
    [bool]$InstallADDS = $true,
    [string]$DomainName = "testdom.local",
    [string]$DomainNetbios = "TESTDOM",
    [string]$TestUserName = "winrmtest",
    [string]$TestUserPassword = "TestPassword123!",
    [string]$DSRMPassword = "DSRMPassword123!",
    [switch]$SkipHTTPS,
    [switch]$InstallOpenSSH
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n===> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# Step 1: Install AD DS (optional)
# -----------------------------------------------------------------------------
if ($InstallADDS) {
    Write-Step "Installing Active Directory Domain Services..."
    
    $addsFeature = Get-WindowsFeature -Name AD-Domain-Services
    if (-not $addsFeature.Installed) {
        Install-WindowsFeature -Name AD-Domain-Services -IncludeManagementTools
        Write-Success "AD DS role installed"
    } else {
        Write-Success "AD DS role already installed"
    }
    
    # Check if already a domain controller
    $dcCheck = Get-WmiObject -Class Win32_ComputerSystem
    if ($dcCheck.DomainRole -lt 4) {
        Write-Step "Promoting to Domain Controller..."
        
        $dsrmSecure = ConvertTo-SecureString $DSRMPassword -AsPlainText -Force
        
        Install-ADDSForest `
            -DomainName $DomainName `
            -DomainNetbiosName $DomainNetbios `
            -SafeModeAdministratorPassword $dsrmSecure `
            -InstallDNS `
            -Force `
            -NoRebootOnCompletion
        
        Write-Success "Domain Controller promotion complete"
        Write-Warn "REBOOT REQUIRED - Run this script again after reboot to complete setup"
        Write-Host "`nRebooting in 10 seconds... (Ctrl+C to cancel)" -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        Restart-Computer -Force
        exit 0
    } else {
        Write-Success "Already a Domain Controller"
    }
}

# -----------------------------------------------------------------------------
# Step 2: Create test user (if AD DS is installed)
# -----------------------------------------------------------------------------
if ($InstallADDS) {
    Write-Step "Creating test AD user: $TestUserName..."
    
    $existingUser = Get-ADUser -Filter "SamAccountName -eq '$TestUserName'" -ErrorAction SilentlyContinue
    if ($existingUser) {
        Write-Success "User $TestUserName already exists"
    } else {
        $userPassword = ConvertTo-SecureString $TestUserPassword -AsPlainText -Force
        
        New-ADUser `
            -Name "WinRM Test User" `
            -SamAccountName $TestUserName `
            -UserPrincipalName "$TestUserName@$DomainName" `
            -AccountPassword $userPassword `
            -Enabled $true `
            -PasswordNeverExpires $true
        
        Add-ADGroupMember -Identity "Administrators" -Members $TestUserName
        
        Write-Success "Created user: $DomainNetbios\$TestUserName"
    }
}

# -----------------------------------------------------------------------------
# Step 3: Enable WinRM
# -----------------------------------------------------------------------------
Write-Step "Configuring WinRM service..."

# Enable WinRM if not already
$winrmService = Get-Service -Name WinRM
if ($winrmService.Status -ne 'Running') {
    Enable-PSRemoting -Force -SkipNetworkProfileCheck
    Write-Success "WinRM enabled"
} else {
    Write-Success "WinRM already running"
}

# Quick config to ensure HTTP listener exists
winrm quickconfig -force 2>$null

# -----------------------------------------------------------------------------
# Step 4: Configure authentication
# -----------------------------------------------------------------------------
Write-Step "Configuring WinRM authentication..."

# Enable Basic auth
Set-Item -Path WSMan:\localhost\Service\Auth\Basic -Value $true
Write-Success "Basic auth enabled"

# Ensure Negotiate (NTLM) is enabled
Set-Item -Path WSMan:\localhost\Service\Auth\Negotiate -Value $true
Write-Success "Negotiate (NTLM) auth enabled"

# Allow unencrypted for HTTP testing (test environment only!)
Set-Item -Path WSMan:\localhost\Service\AllowUnencrypted -Value $true
Write-Success "Unencrypted traffic allowed (for HTTP testing)"

# Disable loopback check for NTLM (required for remote NTLM auth)
$loopbackCheck = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" -Name "DisableLoopbackCheck" -ErrorAction SilentlyContinue
if (-not $loopbackCheck -or $loopbackCheck.DisableLoopbackCheck -ne 1) {
    New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa" -Name "DisableLoopbackCheck" -Value 1 -PropertyType DWord -Force | Out-Null
    Write-Success "Loopback check disabled (for NTLM)"
} else {
    Write-Success "Loopback check already disabled"
}

# -----------------------------------------------------------------------------
# Step 5: Configure HTTPS listener
# -----------------------------------------------------------------------------
if (-not $SkipHTTPS) {
    Write-Step "Configuring HTTPS listener..."
    
    # Check for existing HTTPS listener
    $httpsListener = Get-ChildItem WSMan:\localhost\Listener | 
        Where-Object { $_.Keys -contains "Transport=HTTPS" }
    
    if (-not $httpsListener) {
        # Create self-signed certificate
        $hostname = $env:COMPUTERNAME
        $dnsNames = @($hostname)
        if ($InstallADDS) { $dnsNames += $DomainName }
        
        $cert = New-SelfSignedCertificate `
            -DnsName $dnsNames `
            -CertStoreLocation Cert:\LocalMachine\My `
            -NotAfter (Get-Date).AddYears(5) `
            -KeyAlgorithm RSA `
            -KeyLength 2048
        
        Write-Success "Created self-signed certificate: $($cert.Thumbprint)"
        
        # Create HTTPS listener
        New-Item -Path WSMan:\localhost\Listener `
            -Transport HTTPS `
            -Address * `
            -CertificateThumbprint $cert.Thumbprint `
            -Force
        
        Write-Success "HTTPS listener created on port 5986"
    } else {
        Write-Success "HTTPS listener already exists"
    }
}

# -----------------------------------------------------------------------------
# Step 6: Configure firewall
# -----------------------------------------------------------------------------
Write-Step "Configuring firewall rules..."

# HTTP (5985)
$httpRule = Get-NetFirewallRule -Name "WinRM-HTTP-In-TCP" -ErrorAction SilentlyContinue
if (-not $httpRule) {
    New-NetFirewallRule `
        -Name "WinRM-HTTP-In-TCP" `
        -DisplayName "WinRM HTTP" `
        -Protocol TCP `
        -LocalPort 5985 `
        -Action Allow `
        -Direction Inbound | Out-Null
    Write-Success "Firewall rule created: WinRM HTTP (5985)"
} else {
    Write-Success "Firewall rule exists: WinRM HTTP (5985)"
}

# HTTPS (5986)
if (-not $SkipHTTPS) {
    $httpsRule = Get-NetFirewallRule -Name "WinRM-HTTPS-In-TCP" -ErrorAction SilentlyContinue
    if (-not $httpsRule) {
        New-NetFirewallRule `
            -Name "WinRM-HTTPS-In-TCP" `
            -DisplayName "WinRM HTTPS" `
            -Protocol TCP `
            -LocalPort 5986 `
            -Action Allow `
            -Direction Inbound | Out-Null
        Write-Success "Firewall rule created: WinRM HTTPS (5986)"
    } else {
        Write-Success "Firewall rule exists: WinRM HTTPS (5986)"
    }
}

# -----------------------------------------------------------------------------
# Step 7: Install OpenSSH (optional)
# -----------------------------------------------------------------------------
if ($InstallOpenSSH) {
    Write-Step "Installing OpenSSH Server..."
    
    $sshCapability = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
    if ($sshCapability.State -ne 'Installed') {
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
        Start-Service sshd
        Set-Service -Name sshd -StartupType 'Automatic'
        
        # Firewall rule for SSH
        $sshRule = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
        if (-not $sshRule) {
            New-NetFirewallRule `
                -Name "OpenSSH-Server-In-TCP" `
                -DisplayName "OpenSSH SSH Server (sshd)" `
                -Protocol TCP `
                -LocalPort 22 `
                -Action Allow `
                -Direction Inbound | Out-Null
        }
        Write-Success "OpenSSH Server installed and running"
    } else {
        Write-Success "OpenSSH Server already installed"
    }
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Green
Write-Host " WinRM Setup Complete!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Green

Write-Host "`nListeners:" -ForegroundColor White
winrm enumerate winrm/config/listener 2>$null | Select-String -Pattern "Transport|Port|Address"

Write-Host "`nAuthentication:" -ForegroundColor White
winrm get winrm/config/service/auth 2>$null

if ($InstallADDS) {
    Write-Host "`nTest Credentials:" -ForegroundColor White
    Write-Host "  Domain User: $DomainNetbios\$TestUserName"
    Write-Host "  UPN Format:  $TestUserName@$DomainName"
    Write-Host "  Password:    $TestUserPassword"
}

Write-Host "`nConnection Info:" -ForegroundColor White
try {
    # IMDSv2 requires token
    $token = Invoke-RestMethod -Uri http://169.254.169.254/latest/api/token -Method PUT -Headers @{"X-aws-ec2-metadata-token-ttl-seconds"="60"} -TimeoutSec 2 -ErrorAction Stop
    $publicIP = Invoke-RestMethod -Uri http://169.254.169.254/latest/meta-data/public-ipv4 -Headers @{"X-aws-ec2-metadata-token"=$token} -TimeoutSec 2 -ErrorAction Stop
    Write-Host "  Public IP:   $publicIP"
    Write-Host "  HTTP URL:    http://${publicIP}:5985/wsman"
    if (-not $SkipHTTPS) {
        Write-Host "  HTTPS URL:   https://${publicIP}:5986/wsman"
    }
} catch {
    Write-Host "  (Could not fetch public IP - check AWS console)"
}

Write-Host "`nRemember to configure your AWS Security Group to allow:" -ForegroundColor Yellow
Write-Host "  - TCP 5985 (WinRM HTTP)"
if (-not $SkipHTTPS) { Write-Host "  - TCP 5986 (WinRM HTTPS)" }
if ($InstallOpenSSH) { Write-Host "  - TCP 22 (SSH)" }

