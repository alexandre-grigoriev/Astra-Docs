
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
# Main Classes

| Class                    |                        Header Implementation                         |                                                                                                                         Main task |                            Graph                            |
| :------------------------------------------ | :------------------------------------------------------------------------: | -----------------------------------------------------------: | :----------------------: |
| AstraOPCUAServerWorker   |       AstraOPCUAServerWorker.h <br> AstraOPCUAServerWorker.cpp       |                                                               Handles the Open62541 server (threading, setup, content, callbacks) |            [Worker](./details.md#server-worker)             |
| AstraOPCUAServerModule   |       AstraOPCUAServerModule.h <br> AstraOPCUAServerModule.cpp       |                                                                                                 Standard Astra module boilerplate |          [Module](./details.md#astra-opcua-module)          |
| AstraOPCUAServerBlock    |        AstraOPCUAServerBlock.h <br> AstraOPCUAServerBlock.cpp        |                                                                                Connects the OPCUA classes with the Astra replicas |           [Block](./details.md#astra-opcua-block)           |
| OPCUAServerController    |   AstraOPCUAServerController.h <br> AstraOPCUAServerController.cpp   | Isolates the Astra connector from the Open62541 server via a FIFO and a QThread, and connects blocks, configs and various engines |      [Controller](./details.md#astra-opcua-controller)      |
| OPCUAUtils               |              AstraOPCUAUtils.h <br>AstraOPCUAUtils.cpp               |                                                                Offers various static methods to manage Open62541 data structures. |              [Utils](./details.md#opcua-utils)              |
| AstraOPCUAVariableEngine |     AstraOPCUAVariableEngine.h <br> AstraOPCUAVariableEngine.cpp     |                                                       Sets up the variables known to the OPCUA server, and connects the callbacks | [Variable Engine](./details.md#astra-opcua-variable-engine) |
| AstraOPCUAMethodEngine   |       AstraOPCUAMethodEngine.h <br> AstraOPCUAMethodEngine.cpp       |                              Provides a bridge to handle method calls and their corresponding signatures within the OPC UA server |   [Method Engine](./details.md#astra-opcua-method-engine)   |
| AstraOPCUANodeEngine     |         AstraOPCUANodeEngine.h <br> AstraOPCUANodeEngine.cpp         |                                                            Connects and keeps track of UA nodes via their names and numerical IDs |     [Node Engine](./details.md#astra-opcua-node-engine)     |
| OPCUAServerBootstrapper  | AstraOpcuaServerBootstrapper.h <br> AstraOpcuaServerBootstrapper.cpp |                                                                            Loads values from the JSON setup file or sets defaults |    [Bootstrapper](./details.md#astra-opcua-bootstrapper)    |

# Location

+ astra-QtOPCUA/modules/opcua/src/AstraOPCUAServerModule.cpp
+ astra-QtOPCUA/modules/opcua/src/AstraOPCUAUtils.cpp
+ astra-QtOPCUA/modules/opcua/src/AstraOPCUAVariableEngine.cpp
+ astra-QtOPCUA/modules/opcua/src/AstraOPCUAServerWorker.cpp
+ astra-QtOPCUA/modules/opcua/src/AstraOPCUAServerBlock.cpp

# Important Objects

+ AstraOPCUAServerWorker: manages the _Open 62541_ server and the thread it lives in
+ AstraOPCUAServerController: manages the Astra-side: communication with the _Routines_.

# Channels

In _AstraOPCUAChannels.h_:

    Input<&isEnabledStr, BLOCK> isEnabled;
    Input<&receiverIdStr, BLOCK> receiverId;
    Input<&prepareServerStr, BLOCK> prepareServer;
    Input<&launchServerStr, BLOCK> launchServer;
    Output<&isActiveStr, BLOCK> isActive;
