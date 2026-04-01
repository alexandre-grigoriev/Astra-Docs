
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

# Blocks

This chapter specifies blocks provided by the module. Module automatically creates source factory for all its blocks.

## Block: Andor Detector

ANDOR spectrum detector device.

Type Name: *Astra.Block.Device.Detector.Andor*

JSON: [./astra-QtAndor/modules/andor/assets/blocks/Astra.Block.Device.Detector.Andor.json](../modules/andor/assets/blocks/Astra.Block.Device.Detector.Andor.json)

Block: Device block

![Andor detector main block](./img/AndorBlock.svg)

<!-- newpage -->

| Dir  |        Name         |     Data Type     | Description                                                                                                          | Default |
| :--- | :-----------------: | :---------------: | :------------------------------------------------------------------------------------------------------------------- | ------: |
| in   |     readTrigger     |        int        | Read operation trigger                                                                                               |         |
| in   |        port         | ResourceReference | A Andor device connected via USB.<br>Instance of *Astra.Port.Usb.Andor* collection.                                  |         |
| in   |        gain         |       Enum        | A/D gain.<br>Use *getGains* request on the device to obtain the list of available gains.                             |         |
| in   |        speed        |       Enum        | Acquisition speed (frequency mode).<br>Use *getSpeeds* request on the device to obtain the list of available speeds. |         |
| in   |     shutterMode     |       Enum        | Shutter mode.                                                                                                        |         |
| in   |   shutterPolarity   |       Enum        | Shutter polarity. signal.                                                                                            |         |
| in   | shutterOpeningTime  |        int        | Time shutter takes to close (milliseconds).                                                                          |         |
| in   | shutterClosingTime  |        int        | Time shutter takes to open (milliseconds).                                                                           |         |
| in   |       hMirror       |       bool        | A value indicating whether the camera image is flipped horizontally.                                                 |   false |
| in   |       vMirror       |       bool        | A value indicating whether camera image is flipped vertically.                                                       |   false |
| in   |     targetTemp      |      double       | Target temperature in [degC].                                                                                        |     -50 |
| in   |    imagePalette     |       Enum        | Image color pallette.                                                                                                |       0 |
| in   | imageIntensityRange |    AstraRangeD    | Range of image intenmsities in [%] from actual range.                                                                |         |
| in   |     imageOutput     |       Enum        | A data image URI containing camera image or image BLOB key.                                                          | { 0 }   |
| in   |    timerInterval    |        int        | Read/check timer interval in [ms].                                                                                   |         |
| in   |   acquisitionTime   |        int        | Exposure duration in [ms]                                                                                            |         |
| in   |  numAccumulations   |        int        | Number of readings to average.                                                                                       |       1 |
| in   | outputAccumulations |       bool        | A value indicating whether to put individual accumulations to output spectrum.                                       |   false |
| in   |  accumulationDelay  |        int        | Delay between accumulations in [ms] average.                                                                         |       0 |
| in   |   removeBadPixels   |       bool        | Remove bad pixels.                                                                                                   |    true |
| in   |      badPixels      |       int[]       | Bad pixel indices.                                                                                                   |         |
| out  |         id          |  AstraInstanceId  | Block instance ID                                                                                                    |         |
| out  |     isConnected     |       bool        | A value indicating whether device is connected.                                                                      |         |
| out  |      firmware       |      string       | Firmware version.                                                                                                    |         |
| out  |      chipSize       |     AstraSize     | CCD chip size.                                                                                                       |         |
| out  |      pixelSize      |    AstraSizeD     | CCD pixel size.                                                                                                      |         |
| out  |        image        |        Uri        | Image data URI.                                                                                                      |         |
| out  |     temperature     |      double       | Actual chip temperature in [degC].                                                                                   |         |
| out  |  temperatureRange   |    AstraRangeD    | Chip temperature range in [degC].                                                                                    |         |

### Requests

| Name           | Description              |          Input           |           Output |
| :------------- | :----------------------- | :----------------------: | ---------------: |
| reconnect      | Reconnect device         |                          |                  |
| read           | Read spectra             |                          |                  |
| readImage      | Read CCD image           |                          |                  |
| controlShutter | Switch on/off shutter    |                          |                  |
| readI2C        | Read data from I2C slave |      address, size       |        bytearray |
| writeI2C       | Write data to I2C slave  | address, size, bytearray |                  |
| check          | Check device             |                          |                  |
| abort          | Abort operation          | keepShutter              |                  |
| getGains       | Get available A/D gains  |                          | Array of Objects |
| getSpeeds      | Get available speeds     |                          | Array of Objects |

### Block: Extension block of one spectrum

Type Name: *Astra.Block.Device.Detector.Andor.Spectrum*

JSON: [./astra-QtAndor/modules/andor/assets/blocks/Astra.Block.Device.Detector.Andor.Spectrum.json](../modules/andor/assets/blocks/Astra.Block.Device.Detector.Andor.Spectrum.json)

![Andor detector main block](./img/AndorSpectrumBlock.svg)

| Dir  |   Name    |    Data Type    | Description                                                        | Default |
| :--- | :-------: | :-------------: | :----------------------------------------------------------------- | ------: |
| in   |  mainId   | AstraInstanceId | Main block instance Id                                             |         |
| in   |   index   |       int       | Spectrum index.                                                    |      -1 |
| in   | isEnabled |      bool       | A value indicating whether the channel is enabled for acquisition. |   false |
| in   |   rect    |    AstraRect    | Spectrum rectangle on the camera image                             |         |
| out  |  specrum  |  AstraSpectrum  | Raw spectrum.                                                      |         |

### Block: Extension block for IoOverAndor - DOutput

Type Name: *andor::Astra.Block.Device.Detector.Andor.IoOverAndor.DOutput*

JSON: [./astra-QtAndor/modules/andor/assets/blocks/Astra.Block.Device.Detector.Andor.IoOverAndor.Doutput.json](../modules/andor/assets/blocks/Astra.Block.Device.Detector.Andor.IoOverAndor.DOutput.json)

![Andor ioOverAndor Output](./img/AndorBlockIoOverAndorDOutput.svg)

| Dir  |     Name          |    Data Type    | Description                                                         | Default |
| :--- | :---------------: | :-------------: | :------------------------------------------------------------------ | ------: |
| in   |    mainId         | AstraInstanceId | Main block instance Id                                              |         |
| in   |    value          |    boolean      | value to modify state ON/OFF                                        |   false |
| in   |    address        |       int       | address to use for the I2C protocol                                 |      63 |
| in   |    device         |     string      | letter for the device (a or b)                                      |       a |
| in   |    dataOn         |       string    | datastring to switch on  (1)                                        |         |
| in   |    datatOff       |       string    | datastring to switch off (0)                                        |         |
| in   | writeOnChange     |      bool       | Automatically trigger a write on slave when input pins changes      |    true |
| in   | writeTrigger      |      bool       | Trigger to write data to slave                                      |   false |
| out  |    mainId         | AstraInstanceId | Main block instance Id                                              |         |
| out  | slaveAddress      |       int       | I2C slave address                                                   |         |
| out  |    data           |  byte array     | data to be written at this slave address                            |         |
| out  |    length         |       int       | Length to be written at this slave address                          |         |
| out  | currentValue      |      boolean    | copy current state ON/OFF                                           |         |

The 'allowinternalcall' pin set to true allow to use internal function to write directly on I2C Andor hardware.
If it is set to false (default) the use of the 'writei2c' request is needed in the dataflow.

#### Requests IoOverAndor DOutput

| Name  | Description         | Input | Output |
| :---- | :------------------ | :---: | -----: |
| write | Trigger a write     |       |        |
| get   | Obtain output state |       |        |

### Block: Extension block for IoOverAndor - DInput

Type Name: *andor::Astra.Block.Device.Detector.Andor.IoOverAndor.DInput*

JSON: [./astra-QtAndor/modules/andor/assets/blocks/Astra.Block.Device.Detector.Andor.IoOverAndor.DIntput.json](../modules/andor/assets/blocks/Astra.Block.Device.Detector.Andor.IoOverAndor.DInput.json)

![Andor ioOverAndor Output](./img/AndorBlockIoOverAndorDInput.svg)

| Dir  |     Name          |    Data Type    | Description                                                         | Default |
| :--- | :---------------: | :-------------: | :------------------------------------------------------------------ | ------: |
| in   |    mainId         | AstraInstanceId | Main block instance Id                                              |         |
| in   |    data           |    byte array   | data read at the slave address (if internal call is not used)       |         |
| in   |    address        |       int       | address to use for the I2C protocol                                 |      -1 |
| in   |    length         |       int       | length (number of bytes) to be read at address                      |       0 |
| in   |    byteIdx        |       int       | select wich byte to interpret (0 to length-1)                       |       0 |
| in   |    bitIdx         |       int       | select which bit to interpret in the selected byte (0-7)            |       0 |
| in   |   readTimer       |      bool       | enable read operation timer, use internal call readI2C              |         |
| in   |   readInterval    |      int        | interval duration for timer in [ms]                                 |         |
| out  |      in           |      boolean    | resulting value from data/byte/bit                                  |         |
| out  |      inInv        |      boolean    | inversed value (!in)                                                |         |

The 'allowinternalcall' pin set to true allow to use internal function to read directly on I2C Andor hardware.
If it is set to false (default) the use of the 'readi2c' request is needed in the dataflow to map data pin.

#### Requests IoOverAndor DInput

| Name  | Description          | Input | Output |
| :---- | :------------------- | :---: | -----: |
| read  | Trigger a read       |       |        |

### Andor Detector block typical usage with IO

![Andor detector typical usage](./img/AndorBlock-TypicalDataFlowWithIO.svg)
