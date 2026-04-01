
<!--           Copyright ©2022-2025 - HORIBA France S.A.S.                          -->
<!--       PROPRIETARY AND CONFIDENTIAL - All Rights Reserved                       -->
<!--                                                                                -->
<!--                                                                                -->
<!-- This program - the “Program” - is part of a HORIBA France SAS project. The     -->
<!-- Program - along with all its information - is strictly confidential and        -->
<!-- remains the exclusive ownership of HORIBA France S.A.S. This Program is        -->
<!-- protected under international copyright laws and treaties.                     -->
<!-- Any use, reproduction, or distribution of this Program or of any portion of    -->
<!-- it without the express written authorization from HORIBA France S.A.S. or      -->
<!-- its authorized representatives is strictly prohibited. Unauthorized actions    -->
<!-- may result in severe civil and criminal penalties and will be prosecuted to    -->
<!-- the maximum extent permitted by law.                                           -->
<!-- Unless otherwise expressly agreed in writing with HORIBA France S.A.S., the    -->
<!-- authorization to use the Program is governed by the terms of                   -->
<!-- HORIBA France S.A.S’ license agreement - the “LICENSE Agreement” -. You should -->
<!-- have received a copy of the LICENSE Agreement with the Program. If not,        -->
<!-- please contact HORIBA France S.A.S. to obtain a copy.                          -->
<!-- If you have received this Program without authorization, please notify         -->
<!-- HORIBA France S.A.S. immediately.                                              -->

<!-- This is the OPCUA specific configuration to be included in STARS-Process one -->
<!-- in section "Instruments using OPCUA server" -->

# Configure OPCUA server certificates

## Installation

Ask your IT to copy instrument's private and public key onto controller's storage. Typical location: _c:/ProgramData/HORIBA/astra-##APP_ID##/certs/_
If you overwrite existing certificates, the good practice starts by a backup.

## Certificates characterisitcs for STARS-Process applications OPCUA internal server

##APP_NAME## application OPCUA server is validated using certificates:

### Server certificate


| item                               | setting                                                       | Notes |
| :--------------------------------- | :------------------------------------------------------------ | :---- |
| Encoding                           | DER                                                           |       |
| Public certificate file extension  | ".crt.der"                                                    |       |
| Private key file extension         | ".key.der"                                                    |       |
| Validity                           | 1 year                                                        |       |
| Key size                           | 3072                                                          |       |
| Common name                        | defined                                                       |       |
| Subject Alternative Name           | defined                                                       |       |
| ... _IP address_                   | defined                                                       |       |
| ... _hostname_                     | defined                                                       |       |
| ... uri                            | "urn:_hostname_:HORIBAStarsProcess:htraman"                   |       |
| ... localhost                      | defined                                                       |       |
| ... 127.0.0.1                      | defined                                                       |       |
| Organization name                  | defined                                                       |       |
| Organization unit name             | defined                                                       |       |
| Country name                       | defined                                                       |       |
| Locality name                      | defined                                                       |       |
| State or province name             | defined                                                       |       |
| CA                                 | NO                                                            |       |
| Extended Key Usage                 | server                                                        |       |
| Key Usage                          | critical                                                      |       |
| Digital Signature                  | YES                                                           |       |
| Content Commitment                 | NO                                                            |       |
| Non Repudiation                    | NO                                                            |       |
| Key Encipherment                   | YES                                                           |       |
| Data Encipherment                  | NO                                                            |       |
| Key Agreement                      | NO                                                            |       |
| Key Cert Sign                      | NO                                                            |       |
| CRL Sign                           | NO                                                            |       |
| Encipher Only                      | NO                                                            |       |
| Decipher Only                      | NO                                                            |       |
| Signature                          | SHA256                                                        |       |
| Stored in                          | _C:/ProgramData/HORIBA/astra-##APP_ID##/certs/_               |       |
| Configured in                      | _C:/ProgramData/HORIBA/astra-##APP_ID##/_**astraservice.ini** |       |
| _Public certificate_ registered in | OPCUA _client_ application                                    |       |

<!-- /newpage -->

### Client certificate

| item                              | setting                        | Notes |
| :-------------------------------- | :----------------------------- | :---- |
| Encoding                          | DER                            |       |
| Public certificate file extension | ".crt.der"                     |       |
| Private key file extension        | ".key.der"                     |       |
| Validity                          | 1 year                         |       |
| Key size                          | 3072                           |       |
| Common name                       | defined                        |       |
| Subject Alternative Name          | defined                        |       |
| ... _IP address_                  | defined                        |       |
| ... _hostname_                    | defined                        |       |
| ... uri                           | "urn:_hostname_:HORIBA:laptop" |       |
| ... localhost                     | defined                        |       |
| ... 127.0.0.1                     | defined                        |       |
| Organization name                 | defined                        |       |
| Organization unit name            | defined                        |       |
| Country name                      | defined                        |       |
| Locality name                     | defined                        |       |
| State or province name            | defined                        |       |
| CA                                | NO                             |       |
| Extended Key Usage                | client                         |       |
| Key Usage                         | critical                       |       |
| ... Digital Signature             | YES                            |       |
| ... Content Commitment            | NO                             |       |
| ... Non Repudiation               | NO                             |       |
| ... Key Encipherment              | YES                            |       |
| ... Data Encipherment             | NO                             |       |
| ... Key Agreement                 | NO                             |       |
| ... Key Cert Sign                 | NO                             |       |
| ... CRL Sign                      | NO                             |       |
| ... Encipher Only                 | NO                             |       |
| ... Decipher Only                 | NO                             |       |
| Signature                         | SHA256                         |       |

<!-- /newpage -->

## Configure the system

**Note**: Backup of initial configuration file is recommended before any modification.

Edit the application ini file which is typically: _c:/ProgramData/HORIBA/astra-##APP_ID##/_**astraservice.ini** using a text editor such as Notepad (**do not use Word**).
If the _[modules/opcua]_ section does not exist, create it.

add those lines in the section **[modules/opcua]**:
```
sslCertificateFile="C:\\ProgramData\\HORIBA\\astra-##APP_ID##\\certs\\INSTRUMENT-01.crt.der"
sslKeyFile="C:\\ProgramData\\HORIBA\\astra-##APP_ID##\\certs\\INSTRUMENT-01.key.der"
sslCertificateAuthority="C:\\ProgramData\\HORIBA\\astra-##APP_ID##\\certs\\INSTRUMENT-01-CA.key.der"
```

Additionally, the following comma-separated certificate lists can be specified in the section **[modules/opcua]**:
```
sslTrustList="..."
sslRevocationList="..."
sslIssuerList="..."
```

**Note**: OPCUA server expects certificates to be DER encoded.

### Accept all client certificates (bypassing security policy) {.noexport}
To accept all client certificates, add the following line in the section **[modules/opcua]**:
```
acceptAllCertificates=true
```

## Configure OPCUA server service accounts' credentials

**Note**: Backup of initial configuration file is recommended before any modification.

Edit the application ini file which is typically: _c:/ProgramData/HORIBA/astra-##APP_ID##/_**astraservice.ini** using a text editor such as Notepad (**do not use Word**).
If the _[modules/opcua]_ section does not exist, create it.

add those lines in the section **[modules/opcua]**:

```

allowAnonymous=false
users="login1,passwd1;login2,passwd2"

```

**Note**:

+ Those serviceaccount logins and password are given as an example. Replace by your own.
+ Per account, login and password uses coma as separators
+ When several accounts are to be configured, Logins and passwords pairs should use semicolon as separators
