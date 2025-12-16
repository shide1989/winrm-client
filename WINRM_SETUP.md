# WinRM Test Environment Setup

Automated setup for Windows Server with WinRM and Active Directory for testing.

## Quick Start

```bash
# From your Mac/Linux, via SSH
cat scripts/setup-winrm.ps1 | ssh Administrator@<IP> "powershell -ExecutionPolicy Bypass -Command -"
```

Server reboots after AD DS install. Run again after reboot to complete setup.

## Parameters

| Parameter           | Default            | Description                       |
| ------------------- | ------------------ | --------------------------------- |
| `-InstallADDS`      | **true**           | Install AD DS + Domain Controller |
| `-DomainName`       | `testdom.local`    | AD domain name                    |
| `-TestUserName`     | `winrmtest`        | Test user account                 |
| `-TestUserPassword` | `TestPassword123!` | Test user password                |
| `-SkipHTTPS`        | false              | HTTP only (skip HTTPS)            |
| `-InstallOpenSSH`   | false              | Install SSH server                |

## After Setup

**AWS Security Group** - Allow inbound: 5985 (HTTP), 5986 (HTTPS)

**Test credentials** (if AD installed):

- User: `TESTDOM\winrmtest`
- Password: `TestPassword123!`

**.env.test config:**

```bash
JEST_WINRM_HOST=<public-ip>
JEST_WINRM_USER=Administrator
JEST_WINRM_PASS=<password>

JEST_WINRM_DOMAIN_HOST=<public-ip>
JEST_WINRM_DOMAIN_USER=TESTDOM\winrmtest
JEST_WINRM_DOMAIN_PASS=TestPassword123!
```

**Run NTLM Authentication tests**

```bash
npx jest tests/e2e/ntlm-auth.e2e.test.ts
```

## Troubleshooting

```powershell
# Check config
winrm get winrm/config/service/auth
winrm enumerate winrm/config/listener
```
