
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

# Client unable to see OPCUA server on network

## Symptoms

OPCUA client do not see the OPCUA server when scanning the network.  

## Network issue

First ensure that this is not a network issue by testing:

+ [ ] Redo the test with both OPCUA client and OPCUA server firewall disabled
    + If you can connect then this is not an application configuration issue but a firewall to be configured by IT department.

+ [ ] Test ping from/to OPCUA client and OPCUA server
    + If ping is not working then first check cables then ask your IT to fix this network issue

Otherwise follow the steps below:

## OPCUA server OFF

### Explaination

When internal OPCUA server is not started it will not be detected by client during scan.
This is likely to happen when instrument is not configured to be controlled by automation system on network
Note: internal OPCUA server may be disabled in most cases when instrument is in _'user'_ mode.

### Error recovery

Access application Web UI and ensure that your instrument is in remote control mode.
This mode is likely to be called _'FAB mode'_ in WebUI.

If the operating mode did not solve the issue, follow the steps below:

## OPCUA server binding configuration

### OPCUA server configuration can restrict network to specific subnets

Listening IP addresses range in application configuration _ini file_ may restrict incoming connexions to localhost or subnets where your client do not reside.
When this entry _'host'_ is configured as _'localhost'_ then only local clients will be able to connect.

### Error recovery

+ [ ] Open application settings ini file typically located in _C:/ProgramData/HORIBA/astra-##APP_ID##/astraservice.ini_
+ [ ] Edit or add the key _'host'_ in the section _[modules/opcua]_ (create the section if it did not exist)
+ [ ] Set it to _'0.0.0.0'_
+ [ ] Restart the _'astra-##APP_ID##'_ service (or the operating system if you prefer)

Note: Typical resulting ini file opcua section:

```ini
[modules/opcua]
timeout=10000
port=4840
host=0.0.0.0
path=/##APP_ID##
scheme=opc.tcp
```

# Client is unable to establish connexion with OPCUA server

## OPCUA server restrict clients certificates to trusted ones

### Symptoms

+ Client see the OPCUA server on the network as well as the several secure protocol that can be used
+ Client connexion is rejected when selecting one of those protocol and valid credentials
    + Typical error is _'BadSecurityChecksFailed returned during OpenSecureChannel'_

### Explaination

It is likely to be the client certificate not trusted by instrument OPCUA server

### Error recovery

+ [ ] Export the _der encoded_ client certificate from your OPCUA application acting as a cilent
+ [ ] Copy your client certificate in the dedicated folder on the instrument system (typically _'C:\\ProgramData\\HORIBA\\astra-##APP_ID##\\certs\\'_)
+ [ ] Open application settings ini file typically located in _C:/ProgramData/HORIBA/astra-##APP_ID##/astraservice.ini_
+ [ ] Edit or add the key _'sslTrustList'_ in the section _[modules/opcua]_ (create the section if it did not exist)
+ [ ] Set it to point the location of your certificate (typically _'"C:\\ProgramData\\HORIBA\\astra-##APP_ID##\\certs\\clientcertificate.der"'_)
+ [ ] Restart the _'astra-##APP_ID##'_ service (or the operating system if you prefer)

Typical resulting ini file opcua section:

```ini
[modules/opcua]
timeout=10000
port=4840
host=0.0.0.0
path=/##APP_ID##
scheme=opc.tcp
sslTrustList="C:\\ProgramData\\HORIBA\\astra-htram\\certs\\clientcertificate.der"
```

## OPCUA server rejects user authentication

### Symptoms

+ Client see the OPCUA server on the network as well as the several secure protocol that can be used
+ Client connexion is rejected when selecting one of those protocol and user credentials
    + Error is _'BasUserAccessDenied returned during ActivateSession'_

### Explaination

The credentials are rejected by server

### Error recovery

+ [ ] If your application includes the OPCUA users configuration UI then use it to add or modify the credentials

Otherwise,

+ [ ] Open application settings ini file typically located in _C:/ProgramData/HORIBA/astra-##APP_ID##/astraservice.ini_
+ [ ] Edit or add the key _'users'_ in the section _[modules/opcua]_ (create the section if it did not exist)
+ [ ] Set it to include the credentials
+ [ ] Restart the _'astra-##APP_ID##'_ service (or the operating system if you prefer)

Typical resulting ini file opcua section:

```ini
[modules/opcua]
allowAnonymous=false
users="user1,passwd1;user2,passwd2"
```
