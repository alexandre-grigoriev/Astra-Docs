
[//]: # (           Copyright ©2022-2025 - HORIBA France S.A.S.                          )
[//]: # (       PROPRIETARY AND CONFIDENTIAL - All Rights Reserved                       )
[//]: # (                                                                                )
[//]: # (                                                                                )
[//]: # ( This program - the “Program” - is part of a HORIBA France SAS project. The     )
[//]: # ( Program - along with all its information - is strictly confidential and        )
[//]: # ( remains the exclusive ownership of HORIBA France S.A.S. This Program is        )
[//]: # ( protected under international copyright laws and treaties.                     )
[//]: # ( Any use, reproduction, or distribution of this Program or of any portion of    )
[//]: # ( it without the express written authorization from HORIBA France S.A.S. or      )
[//]: # ( its authorized representatives is strictly prohibited. Unauthorized actions    )
[//]: # ( may result in severe civil and criminal penalties and will be prosecuted to    )
[//]: # ( the maximum extent permitted by law.                                           )
[//]: # ( Unless otherwise expressly agreed in writing with HORIBA France S.A.S., the    )
[//]: # ( authorization to use the Program is governed by the terms of                   )
[//]: # ( HORIBA France S.A.S’ license agreement - the “LICENSE Agreement” -. You should )
[//]: # ( have received a copy of the LICENSE Agreement with the Program. If not,        )
[//]: # ( please contact HORIBA France S.A.S. to obtain a copy.                          )
[//]: # ( If you have received this Program without authorization, please notify         )
[//]: # ( HORIBA France S.A.S. immediately.                                              )
# OPCUA Interface with Astra

## Metadata
|    Date    |        Author         | Revision |  Notes   |
| :--------: | :-------------------: | :------: | :------: |
| 15/10/2025 | Vincent Vandenbroecke |   v0.1   | As built |

## Contents

### Ini file parameters

| Key               | Description                                              | Default value | Comment                                 |
| :---------------- | :------------------------------------------------------- | :-----------: | :-------------------------------------- |
| verbose           | If true, the default logLevel will be "debug"            |     false     | **Deprecated.** Will be removed in v1.4 |
| logLevel          | Verbosity level of OPCUA module                          |    "info"     | category 'opcua'                        |
| dataLogLevel      | Verbosity level of OPCUA sent or received data           |    "info"     | category 'opcuaData'                    |
| open62541LogLevel | Verbosity level of open62541 library                     |    "info"     | category 'open62541Log'                 |
| timeout           | Timeout for QtRoutine to handle method execution request |    10 000     | milliseconds                            |

Note: allowed verbosity levels are "debug", "info", "warning", "critical" and "fatal".  
Verbosity level settings can be overridden by environment variable QT_LOGGING_RULES, e.g.

#### Examples

```ini
[modules/opcua]
logLevel=debug
timeout=5000
```

```powershell
$env:QT_LOGGING_RULES="opcua.debug=true;opcuaData.debug=false;open62541.debug=false"
```

### Methods

#### Execute Server -> Controller
Execute a request from the server to the controller

>**QFuture\<AstraReply> OPCUAController::execute(const AstraRequest& request)**

>- request.Name: string. Name of this function "execute"
>- request.Data : QJsonValue - type OPCUAcontrollerInput

> return : AstraReply

>- reply.Data : QJsonValue - type  OPCUAcontrollerOutput

#### Type OPCUAControllerInput
>**class OPCUAControllerInput**
>- methodName : string. Task or event name to be executed
>- parameters : QJsonValue. Parameters to the task.

```json
{
    "methodName": "myMethodName",
    "parameters": {
        "MyJsonObject"
    }
}
```

"MyJsonObject" must contain input arguments according to the method definition in the server configuration.

#### Type OPCUAControllerOutput
>**class OPCUAControllerOutput**
>- data : QJsonValue. Task results.

Example of data structure:
```json
{
  "data": {
    "Result": true,
    "Error": 010001
  }
}
```

The "data" field must contain output arguments according to the method definition in the server configuration.
Additional top-level fields are allowed, but ignored.

### Variables

#### AnalyzerStatus
##### Source AnalyzerStatusSource
Source created by the analyzerStatusSource class, which contains theses booleans:

>Initialized
>Ready for measurement
>Measurement in progress
>Camera temperature OK
>Stage at loading/unloading position
>Blocked by External Interlock
>Analyzer disconnected
>Stage outside Analyzer

These datas are compiled as a QJsonValue
This class subscribes to analyzerStatus as a replica and monitors the dataChanged signal
The server subscribes to this source using a replica.
The IDs and types will be shared between the server and the controller via the json initialisation file :
>**HTRAM_OPCUA_CONTROLLER_ANALYZER_STATUS_TYPE_NAME** "HTRam.OPCUA.Controller.Variables"
>**HTRAM_OPCUA_CONTROLLER_ANALYZER_STATUS_INSTANCE_NAME** "AnalyzerStatus"

The data of the replica respect this structure:
```json
{
    "initialized": true,
    "readyForMeasurement": false,
    "measurementInProgress": true,
    "cameraTemperatureNominal": false,
    "stageLoadingPosition": true,
    "blockedbyExternalInterlock": false,
    "analyzerDisconnect": true,
    "stageOutsideAnalyzer": false
}
```

#### AnalyzerError
##### Source AnalyzerErrorSource
Source created by the analyzerErrorSource class, which contains the current error of the connected analyzer.

The data of the replica contains an error code and is compiled as a QJsonValue.

#### InterlocksFromField / InterlocksToField
##### Source InterlocksFieldSource
Source created by the InterlocksFieldSource class, which contains the interlocks from the analyzer

Server can update this data via a request from its replica.

The data of the replica is a boolean and is compiled as a QJsonValue.

#### Application State
##### Source ApplicationStateSource
Source created by the ApplicationStateSource class, which containts a string representing the current state of the analyzer

The data of the replica is a string and is compiled as a QJsonValue.
The possible values :
|                Title                |                 Value                  |
| :---------------------------------: | :------------------------------------: |
|                Idle                 |      Ready to get the new request      |
| Analyzer initialization In Progress | Analyzer initialization is in progress |
|           Analyzer error            |         Error in the Analyzer          |
|        Validation InProgress        |         Validation InProgress          |
|       Calibration InProgress        |         Calibration InProgress         |
|       Measurement InProgress        |         Measurement InProgress         |
|         Shutdown InProgress         |      Analyzer shutdown InProgress      |

### Events
Request the 'execute' function of the server.
>**QFuture\<AstraReply> AstraOPCUAServerBlock::processEvent(const AstraRequest& request)**
>- request.Name : string. Name of this function "processEvent"
>- request.Data : QJsonValue - type OPCUAControllerInput

Events names to be used:
>ApplicationStateChangeEvent
>MeasurementCompleted
>ErrorEventType
>TaskCompleted

Example of data structure:
```json
{
    eventId: "TaskCompletedEvent",
    message: "myMessage",
    data: {
        "RequestId": "UA_MEASUREMENTCOMPLETED",
        "Result": true
    }
}
```

The "data" field must be an object containing fields according to the event data definition in the server configuration.
