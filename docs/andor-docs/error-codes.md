
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


# STARS Process Andor module Functional Analysis

See: [/astra-QtAndor/modules/andor/src/AndorDetectorBlock.cpp](../modules/andor/src/AndorDetectorBlock.cpp)

| Code | ID                                       | Description                               | Severity    |
| ---- | ---------------------------------------- | ----------------------------------------- | ----------- |
| 1    | ANDOR_RESULT_CODE_CONNECTION_ERROR       | Error connecting to USB Andor detector    | Critical    |
| 2    | ANDOR_RESULT_CODE_SETUP_ERROR            | Error when setting up the Andor detector  | Major       |
| 3    | ANDOR_RESULT_CODE_AREA_ERROR             | Error in area of interest definition      | Major       |
| 4    | ANDOR_RESULT_CODE_START_ERROR            | Error when starting                       | Major       |
| 5    | ANDOR_RESULT_CODE_OPERATION_CANCELED     | Operation cancelled                       | Information |
| 6    | ANDOR_RESULT_CODE_FETCH_ERROR            | Error when fetching results               | Major       |
| 7    | ANDOR_RESULT_CODE_CAMERA_NOT_SELECTED    | Error: camera not selected                | Minor       |
| 8    | ANDOR_RESULT_CODE_CONTROL_SHUTTER_FAILED | Error: unable to control shutter          | Major       |
| 9    | ANDOR_RESULT_CODE_READ_I2C_FAILED        | Error: unable to read from I2C            | Information |
| 10   | ANDOR_RESULT_CODE_WRITE_I2C_FAILED       | Error: unable to write from I2C           | Information |
| 100  | ANDOR_RESULT_CODE_NOT_SUPPORTED          | Error: Requested command is not supported | Major       |
