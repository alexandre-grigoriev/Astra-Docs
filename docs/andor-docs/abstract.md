
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


STARS-Process controls an Andor camera.
Spectrometer using Andor detector allows to acquire sprectra.
This includes trigger acquisition, parameters setup, shutter control, etc.

# Detector {.noexport}

## Driver details {.noexport}

+ Camera: Andor iDus 420 OE
  + SDK for windows: [https://andor.oxinst.com/downloads/view/andor-sdk-2.104.30084.0](https://andor.oxinst.com/downloads/view/andor-sdk-2.104.30084.0)
  + SDK for Linux: [https://andor.oxinst.com/downloads/view/andor-linux-sdk-2.104.30088.0](https://andor.oxinst.com/downloads/view/andor-linux-sdk-2.104.30088.0)
  + SDK for ARM: build for HORIBA [../libs/ATMCD.arm](../libs/ATMCD.arm)

# Spectrometer {.noexport}

## Hardware details  {.noexport}

Using this module you'll be able to control a fixed spectrometer only.
