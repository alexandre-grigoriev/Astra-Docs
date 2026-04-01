
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
# OPCUA Module implementation details
<!-- markdownlint-disable-file MD046 Fenced blocks used throughout document -->

[overview](./Overview.md) {.include}


## Process

### Main sequence

The system provides a converter and manager for an OPCUA server (open62541 based), and encapsulates it in a separate thread to avoid blocking the Astra system.

```graphviz {#id .class width=600px}
digraph {
        // Global graph styling
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        labelloc="t",
        labeljust="c"
    ];

    // Node styling
    node [
        shape=box,
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Edge styling
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];
   Astra [label="Astra\n(Main Thread)", fillcolor="#cce5ff"];

    subgraph cluster_OPCUA {
        label="Signal/slot connectors";
        style=rounded;
        color="#888888";

        OPCUAThread [label="OPCUA Thread", fillcolor="#ffeecc", style=filled, shape=ellipse];
        OPCUAServer [label="OPCUA Server\n(open62541-based)", fillcolor="#ffffff", style=filled];
    }

    AstraSystem [label="Astra System", shape=box, fillcolor="#ddffdd", style=filled];

    // Relationships
    AstraSystem [label="Astra System", shape=box, style=filled, fillcolor="#ccffcc"];

    AstraSystem -> OPCUAThread [label="Spawns & communicates with", fontsize=12];
    OPCUAThread -> OPCUAServer [label="Encapsulates\n(Non-blocking)", fontsize=12];
    Client -> OPCUAServer [label="OPCUA Interface (open62541)", fontsize=10];
}
```

<!-- /newpage -->

##### Class diagram Worker

```mermaid
classDiagram
    direction TB

    class ThreadObject {
        +ThreadObject(AstraOPCUAServerWorker* parent)
        +void process()
        +signal void finished()
    }

    class AstraOPCUAServerWorker {
        +AstraOPCUAServerWorker()
        +~AstraOPCUAServerWorker()
        +void setController(OPCUAServerController* controller)
        +bool IsRunning() const
        +void LoadServerEvent(AstraOpcuaJSONEvent)
        +void LoadServerMethod(AstraOpcuaJSONMethod)
        +void launchServer(std::shared_ptr<AstraOPCUAServerConfig> config)
        +void stopServer()
        +void raiseRoutineEvent(AstraEventToOPCUA event)
        +void raiseRoutineVariableChange(QJsonObject data)
        +void runServer()
        +signal void routineRequestSignal(OPCUARequestToAstra request, const QJsonObject& json)
        +signal void opcuaVariableChange(QString variableId, QJsonObject data)
    }

    class OPCUAServerController {
    }

    class OPCUARequestToAstra {
    }

    AstraOPCUAServerWorker --> OPCUAServerController : uses
    AstraOPCUAServerWorker --> OPCUARequestToAstra : connects
    AstraOPCUAServerWorker --> AstraOPCUANodeEngine : manages
    AstraOPCUAServerWorker --> AstraOPCUAVariableEngine : manages
    ThreadObject --> AstraOPCUAServerWorker : parent relationship
```

[↩️](#main-classes)

---

#### Server Worker

This class is both the most important and relatively simple conceptually.

The Worker is a `QObject`. It is hosted in a ThreadObject, which is merely a `QObject` with a _process_ slot and a _finished_ signal.
The process method asks the Worker to run the server. When the server stops running, the finished signal is emitted.

```graphviz {#id .class width=600px}
digraph {
        // Global graph styling
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        labelloc="t",
        labeljust="c"
    ];

    // Node styling
    node [
        shape=box,
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Edge styling
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];
    rankdir=TB;
    splines=ortho;
    nodesep=0.8;
    ranksep=1;
    graph [margin=0.3];


    Title [ peripheries=2, label = "Do me"];

  ThreadObject [label="ThreadObject\n(QObject)\n| process() [slot]\n| finished() [signal]", shape=record];

  Worker [label="Worker\n(QObject)\n| runServer()", shape=record];

  ThreadObject -> Worker [label="calls runServer()"];
  Worker -> ThreadObject [label="signals completion"];
  ThreadObject -> ThreadObject [label="emits finished()", style=dashed];

}
```

##### Worker logic

The class diagram shows the handles: set the controller with `setController`, communicate demands for routines and variables via `raiseRoutineEvent` and `raiseRoutineEvent`, track Astra variable changes via the signal òpcuaVariableChange`.
When Astra responds to a routine call, it uses the signal raiseRoutineVariableChange`.

Two important notes: the OPCUA server runs once launched via `runServer()`and until stopped via `stopServer()` (or an emergency stop), as reflected in the `IsRunning()` method. It currently loads its config via the launchServer method, which reads the config as a JSON file (that will later be passed via an Astra pin).

```graphviz {#id .class width=600px}
digraph {
        // Global graph styling
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        labelloc="t",
        labeljust="c"
    ];

    // Node styling
    node [
        shape=box,
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Edge styling
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];

         rankdir=TB;
    graph [splines=true, nodesep=1, ranksep=1];

    node [shape=box, style=filled, fontsize=14, height=1, fixedsize=true, width=5];

    Controller [label="Controller", fillcolor="#ddeeff"];
    Astra [label="Astra", fillcolor="#ddffdd"];

    { rank=same; Controller }
    { rank=same; Astra }

    Controller -> Astra [label="setController", fontsize=12];
    Controller -> Astra [label="raiseRoutineEvent()", fontsize=12];
    Controller -> Astra [label="raiseRoutineEvent(vars)", fontsize=12];

    Astra -> Controller [label="opcuaVariableChange", fontsize=12, style=dashed];
    Astra -> Controller [label="raiseRoutineVariableChange()", fontsize=12, style=dashed];
}
```

##### Class Diagram Worker

```mermaid
classDiagram
    class ThreadObject {
        +process() slot
        +finished() signal
        -AstraOPCUAServerWorker* _parent
    }

    class AstraOPCUAServerWorker {
        +setController(OPCUAServerController*)
        +IsRunning() bool
        +LoadServerEvent(AstraOpcuaJSONEvent)
        +LoadServerMethod(AstraOpcuaJSONMethod)
        +launchServer(std::shared_ptr~AstraOPCUAServerConfig~) slot
        +stopServer() slot
        +raiseRoutineEvent(AstraEventToOPCUA) slot
        +raiseRoutineVariableChange(QJsonObject) slot
        +runServer() slot
        +routineRequestSignal(OPCUARequestToAstra, QJsonObject) signal
        +opcuaVariableChange(QString, QJsonObject) signal
        -bool _running
        -bool _devMode
        -UA_Server* _open62541server
        -QMap<QString, UA_NodeId> _eventsId
        -OPCUAServerController* _controller
        -AstraOPCUANodeEngine _nodeEngine
        -AstraOPCUAVariableEngine _variableEngine
        -addEvent(UA_Server*, AstraOpcuaJSONEvent) UA_StatusCode
        -addMethod(UA_Server*, AstraOpcuaJSONMethod) UA_StatusCode
        -addObjectNode(UA_Server*, string, int) QPair~UA_StatusCode, UA_NodeId~
        -findObjectNode(string, int, bool) UA_NodeId
        -findMethodNode(string, int) UA_NodeId
        -static ConvertMethodCallbackDataFromJSONResponseToVariant(...)
        -static triggerAstraRequestCallback(...)
        -static requestAvailabilityCallback(...)
        -static getDataFromFilePathOrBase64String(...)
        -static getJSONValue(QByteArray)
    }

    ThreadObject --> AstraOPCUAServerWorker : has reference
```

[↩️](#main-classes)

---

### Astra OPCUA module

```graphviz {#id .class width=600px}
digraph AstraOPCUAServerModule {
    rankdir=TB;
    nodesep=0.6;
    ranksep=0.8;
    splines=ortho;

    node [shape=ellipse, style=filled, fillcolor=black, fontcolor=white];
    start [label="Start"];
    end [label="End"];

    // Global graph styling
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        label="AstraOPCUAMethodEngine Method Flows",
        labelloc="t",
        labeljust="c"
    ];

    // Node styling
    node [
        shape=record,
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Edge styling
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];

    // Constructor Graph
    subgraph cluster_constructor {
        label="Constructor";
        color=blue;
        style=filled;
        fillcolor=lightblue;

        start -> setModuleType;
        setModuleType -> setVersion;
        setVersion -> setDescription;
        setDescription -> end;
    }

    // Initialization Graph
    subgraph cluster_initialize {
        label="Module Initialization";
        color=green;
        style=filled;
        fillcolor=lightgreen;

        initializeModule [label="initializeModule()"];
        resetFactory [label="_serverFactory.reset(new AstraOPCUAServerBlockFactory())"];
        setParameters [label="setParameters(node(), ':/opcua/assets/blocks/Astra.Block.Server.OPCUA.json')"];
        setModuleState [label="setModuleState(INITIALIZED)"];
        AstraModuleInitialize [label="AstraModule::initializeModule()"];

        initializeModule -> resetFactory;
        resetFactory -> setParameters;
        setParameters -> setModuleState;
        setModuleState -> AstraModuleInitialize;
    }

    // Deinitialization Graph
    subgraph cluster_deinitialize {
        label="Module Deinitialization";
        color=red;
        style=filled;
        fillcolor=lightcoral;

        deinitializeModule [label="deinitializeModule()"];
        resetFactoryDeinit [label="_serverFactory.reset()"];
        AstraModuleDeinitialize [label="AstraModule::deinitializeModule()"];

        deinitializeModule -> resetFactoryDeinit;
        resetFactoryDeinit -> AstraModuleDeinitialize;
    }
}
```

##### Class Diagram OPCUA Module

```mermaid
classDiagram
    class AstraModule

    class AstraOPCUAServerModule {
        +AstraOPCUAServerModule(QObject* parent = nullptr)
        +~AstraOPCUAServerModule()
        +void initializeModule()
        +void deinitializeModule()
    }

    AstraOPCUAServerModule --|> AstraModule : inherits
```

[↩️](#main-classes)

---

##### Astra OPCUA Block

The block connects replicas from Astra and the controller managing the OPCUA Worker thread.
It relies on connecting signals and replicas with the methods shown in the class diagram beneath.

```graphviz {#id .class width=600px}
digraph {
        // Global graph styling
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        labelloc="t",
        labeljust="c"
    ];

    // Node styling
    node [
        shape=box,
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Edge styling
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];
    rankdir=TB;
    splines=ortho;
    nodesep=0.8;
    ranksep=1;
    graph [margin=0.3];

        // Constructor Graph
    subgraph cluster_constructor {
        label="Constructor";

        start -> connectChannels;
        connectChannels -> connectSignals;

        subgraph cluster_channels {
            label = "connect channels";
            node [
                shape=ellipse;
                color=blue;
                style=filled;
                fillcolor="white:pink";
                gradientangle=270;
                fontname="Helvetica";
                fontcolor="black";
                color=navyblue;
        ];

        edge [
        color="pink",
        fontname="Helvetica"
        ];
            connectChannels -> prepareServer;
            connectChannels -> receiverId;
            connectChannels -> launchServerChannel;
        }
        subgraph cluster_signals {
            label = "connect signals";
            node [
                shape=ellipse;
                color=blue;
                style=filled;
                fillcolor="white:pink";
                gradientangle=270;
                fontname="Helvetica";
                fontcolor="black";
                color=navyblue;
            ];

        edge [
        color="pink",
        fontname="Helvetica"
        ];
            connectSignals -> prepareServerConfiguration;
            connectSignals -> updateReceiver;
            connectSignals -> launchServer;
        }

        connectSignals -> end;
    }
}
```

##### Class Diagram OPCUA Block

```mermaid
classDiagram
    class OPCUAServerController

    class AstraOPCUAServerBlock {
        +AstraOPCUAServerBlock(QObject* parent, std::shared_ptr<OPCUAServerController> controller)
        +~AstraOPCUAServerBlock()
        +static blocks::Info blockInfo()
        +bool isEnabled() const
        +AstraInstanceId receiverId() const
        +void setOutputIsActive(bool value)
        +QFuture<AstraReply> resultExecute(const AstraRequest& request)
        +QFuture<AstraReply> processEvent(const AstraRequest& request)
        +QFuture<AstraReply> processVariableChange(const AstraRequest& request)
        +AstraReply RequestRoutineMethod(QJsonObject json)
        +void createReplica(QString ressourceType, QString name)
        +QFuture<AstraReply> updateReplica(QString variableId, QJsonObject object)
        +void writeJsonError(int code, QString source, QString message, QJsonObject& json)
        +void writeJsonError(const AstraResult& result, QJsonObject& json)
        +signal void AstraDataChanged(QJsonObject json)
    }

    AstraOPCUAServerBlock --> OPCUAServerController : uses (shared_ptr)

```

[↩️](#main-classes)

---

#### Astra OPCUA Controller

```graphviz {#id .class width=600px}
digraph OPCUAServerController {
        // Global graph styling
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        labelloc="t",
        labeljust="c"
    ];

    // Node styling
    node [
        shape=box,
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Edge styling
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];
    rankdir=TB;
    splines=ortho;
    nodesep=0.8;
    ranksep=1;
    graph [margin=0.3];

    subgraph cluster_thread_management {
        label="Thread Management";
        color=blue;
        style=filled;
        fillcolor=lightblue;

        OPCUAServerController -> AstraOPCUAServerWorker [label="moveToThread", color=red, penwidth=2];
        OPCUAServerController -> ocpuaServerWorkerThread [label="start", color=red];
        ocpuaServerWorkerThread -> AstraOPCUAServerWorker [label="finished", color=red];
    }

    subgraph cluster_signal_connections {
        label="Signal Connections";
        color=green;
        style=filled;
        fillcolor=lightgreen;

        OPCUAServerController -> AstraOPCUAServerWorker [label="launchServer", color=green, style=dashed];
        OPCUAServerController -> AstraOPCUAServerWorker [label="stopServer", color=green, style=dashed];
        OPCUAServerController -> AstraOPCUAServerWorker [label="raiseRoutineEvent", color=green];
        OPCUAServerController -> AstraOPCUAServerWorker [label="raiseRoutineVariableChange", color=green];
        AstraOPCUAServerWorker -> OPCUAServerController [label="handleResults", color=green, style=dotted];
    }

    subgraph cluster_event_flow {
        label="Event & Data Flow";
        color=purple;
        style=filled;
        fillcolor=lavender;

        OPCUAServerController -> AstraOPCUAServerBlock [label="AstraDataReceived", color=purple];
        OPCUAServerController -> AstraOPCUAServerBlock [label="TransmitAstraEventToOPCUA", color=purple];
        OPCUAServerController -> AstraOPCUAServerBlock [label="TransmitAstraVariableChangeToOPCUA", color=purple];
    }

    subgraph cluster_method_engine {
        label="Method Engine";
        color=orange;
        style=filled;
        fillcolor=lightgoldenrodyellow;

        OPCUAServerController -> AstraOPCUAMethodEngine [label="LoadServerMethod()", color=orange];
        OPCUAServerController -> AstraOPCUAEventDefinition [label="LoadServerEvent()", color=orange];
    }
}


```

##### Class Diagram OPCUA Controller

```mermaid
classDiagram
    class AstraOPCUAServerBlock
    class AstraOPCUAServerWorker
    class AstraOPCUAServerConfig
    class OPCUARequestToAstra {
        +AstraOPCUAServerWorker* worker
        +QString methodId
    }
    class AstraEventToOPCUA {
        +QString eventID
        +QJsonObject eventData
    }
    class OPCUAServerController {
        +StartServer()
        +StopServer()
        +TransmitAstraEventToOPCUA(QJsonObject data)
        +TransmitAstraVariableChangeToOPCUA(QJsonObject data)
        +TransferVariableChangeToAstra(QString variableId, const QJsonObject& json)
        +SetupWithConfig(std::shared_ptr<AstraOPCUAServerConfig> config)
        +ConnectBlock(AstraOPCUAServerBlock* block)
        +LoadServerMethod(AstraOPCUAMethodDefinition methodDefinition)
        +LoadServerEvent(AstraOPCUAEventDefinition eventDefinition)
        +std::shared_ptr<AstraOPCUAServerConfig> getConfig()
        +QList<AstraOPCUAMethodOutputArgumentDefinition> GetMethodOutputStructure(QString methodID)
        -AstraOPCUAServerBlock* _block
        -std::shared_ptr<AstraOPCUAServerConfig> _config
        -QQueue<QJsonObject> fifo
        -QMutex _mutex
        -QThread ocpuaServerWorkerThread
        -AstraOPCUAMethodEngine _methodEngine
        -UA_LocalizedText getLocalizedText(char* text)
        -configureLogging()
    }
    class OPCUAServerEncryptionFactory {
        +static AstraOPCUAServerEncryption fromString(QString encryptionStr)
    }

    enum AstraOPCUAServerEncryption

    OPCUARequestToAstra --> AstraOPCUAServerWorker : controls
    OPCUAServerController --> AstraOPCUAServerBlock : uses
    OPCUAServerController --> AstraOPCUAServerConfig : needs
    OPCUAServerController --> AstraOPCUAMethodEngine : uses
    OPCUAServerController --> AstraEventToOPCUA : transmits
    OPCUAServerEncryptionFactory --> AstraOPCUAServerEncryption : provides
```

[↩️](#main-classes)

---

### OPCUA Utils

##### Class diagram OPCUA Utils

```mermaid
classDiagram

    class OPCUAUtils {
        +OPCUAUtils()
        +static const std::unordered_map&lt;QString, UA_NodeId&gt; uaTypeIdMap
        +static const std::unordered_map&lt;QString, UA_DataType*&gt; uaTypeMap
        +static QString accessLevelToString(UA_AccessLevelType accessLevel)
        +static UA_AccessLevelType extractAccessLevelFromJSONValue(QString accessLevel)
        +static UA_StatusCode convertJsonValueToVariant(const QString& type, const QJsonValue& value, UA_Variant* output)
        +static UA_StatusCode buildVariantArray(const QString& type, const QJsonValue& valueOfArrayContent, int remainingDimension, UA_Variant* constructedVariantArray)
        +static UA_StatusCode convertJsonValueToFlatValueInArray(const QString& type, const QJsonValue& value, void* array, int i)
        +static void bruteLog(UA_Variant* variant, int variantSize)
        +static bool isWritableCurrent(UA_Byte accessLevel)
        +static bool isWritableHistory(UA_Byte accessLevel)
        +static int getValueRank(QString typeString)
        -static QRegularExpression _oneOrMoreDigitsFollowedWithD_RegularExpression
    }

    class UtilityFunctions {
        +UA_LocalizedText getLocalizedText(const char* text, bool retain=false)
        +UA_QualifiedName getQualifiedName(const char* text, int index=0, bool retain=false)
        +UA_String getString(const char* text, bool retain=false)
        +QString getString(const UA_String* text)
        +UA_NodeId getNode(const char* text, int index=0, bool retain=false)
        +UA_NodeId getDatatypeNodeId(QString typeString)
        +UA_DataType* getDatatype(QString typeString)
        +QString getArrayType(QString typeString)
    }

    note "WARNING: Not an actual class, simple C style functions"
    endnote

    %% Relationships

    OPCUAUtils *-- UaTypeIdMap : owns
    OPCUAUtils *-- UaTypeMap : owns
    OPCUAUtils --> UA_Variant : uses
    OPCUAUtils --> UA_AccessLevel : uses
    OPCUAUtils --> UA_NodeId : uses
    OPCUAUtils --> UA_DataType : uses
    OPCUAUtils --> UA_Byte : uses
    OPCUAUtils --> QString : uses
    OPCUAUtils --> QJsonValue : uses
    OPCUAUtils *-- QRegularExpression : owns

    UtilityFunctions --> UA_NodeId : returns
    UtilityFunctions --> UA_DataType : returns
    UtilityFunctions --> QString : returns
    UtilityFunctions --> UA_Variant : returns

    %% TODO: figure out how to write those two lines
    %%class "std::unordered_map&lt;QString, UA_NodeId&gt;" as UaTypeIdMap
    %%class "std::unordered_map&lt;QString, UA_DataType*&gt;" as UaTypeMap
```

> 📝📝📝 Move Utility functions to class 📝📝📝

[↩️](#main-classes)

---

### Astra Opcua Variable Engine

```graphviz {#id .class width=600px}
digraph AstraOPCUAVariableEngineMethods {

     // Global graph styling
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        label="AstraOPCUAMethodEngine Method Flows",
        labelloc="t",
        labeljust="c"
    ];

    // Node styling
    node [
        shape=record,
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Edge styling
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];

    rankdir=LR;
    node [shape=rectangle, style=filled, fillcolor=lightblue, fontname="Helvetica", fontsize=12];

    // Methods
    // callbacks are in a heavy state of rework...
    beforeWriteCallback [label="beforeWriteCallback\n(UA_Server*, UA_NodeId*, void*, UA_NodeId*, void*, UA_NumericRange*, UA_DataValue*)"];
    setup [label="setup\n(OPCUAVariableDefinitions, UA_Server*, OPCUAServerController*, AstraOPCUANodeEngine&)"];
    findVariableNode1 [label="findVariableNode\n(QString, int)"];
    findVariableNode2 [label="findVariableNode\n(AstraOpcuaJSONVariable, bool)"];
    addVariable [label="addVariable\n(const AstraOpcuaJSONVariable&, UA_NodeId*)"];


    setup -> findVariableNode2 [label="Calls"];
    setup -> addVariable [label="Calls"];

    findVariableNode2 -> findVariableNode1 [label="Calls"];
    findVariableNode2 -> addVariable [label="May Call"];

    // Styling improvements
    edge [fontname="Helvetica", fontsize=10, color=black, arrowhead=vee];
}


```

<!-- /newpage -->

##### Class diagram Variable Engine

```mermaid
classDiagram
    class AstraOPCUAVariableEngine {
        +UA_NodeId findVariableNode(QString nodeTag, int namespaceIndex)
        +UA_NodeId findVariableNode(AstraOpcuaJSONVariable variable, bool orCreate)
        +static void beforeWriteCallback(UA_Server* server, const UA_NodeId* sessionId, void* sessionContext, const UA_NodeId* nodeId, void* nodeContext, const UA_NumericRange* range, const UA_DataValue* data)
        +VariableEngineStatus setup(OPCUAVariableDefinitions variables, UA_Server* server, OPCUAServerController* controller, AstraOPCUANodeEngine& nodeEngine)
        -VariableEngineStatus addVariable(const AstraOpcuaJSONVariable& variable, UA_NodeId* outNewNodeId)
        -OPCUAVariableDefinitions _variables
        -UA_Server* _server
        -OPCUAServerController* _pController
        -AstraOPCUANodeEngine* _pNodeEngine
    }

    class AstraOPCUAVariableChangeContext {
        +OPCUAServerController* controller
        +AstraOPCUANodeEngine* nodeEngine
        +OPCUAVariableDefinitions* definitions
    }

    class OPCUAServerController
    class AstraOPCUANodeEngine

    %% Relationships:

    %% Composition (strong ownership, part of the whole)
    AstraOPCUAVariableEngine *-- OPCUAVariableDefinitions : owns

    %% Aggregation (weak ownership, can exist separately)
    AstraOPCUAVariableEngine o-- UA_Server : references
    AstraOPCUAVariableEngine o-- OPCUAServerController : references
    AstraOPCUAVariableEngine o-- AstraOPCUANodeEngine : references

    %% Usage / Association (depends on, but no ownership)
    AstraOPCUAVariableChangeContext --> OPCUAServerController : uses
    AstraOPCUAVariableChangeContext --> AstraOPCUANodeEngine : uses
    AstraOPCUAVariableChangeContext --> OPCUAVariableDefinitions : uses

```

[↩️](#main-classes)

---

### Astra Opcua Method Engine

```graphviz {#id .class width=600px}
digraph MethodFlow {
    // Global graph styling
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        label="AstraOPCUAMethodEngine Method Flows",
        labelloc="t",
        labeljust="c"
    ];

    // Node styling
    node [
        shape=record,
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Edge styling
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];

    // -------------------------
    // 1) addMethod(...) Flow
    // -------------------------
    subgraph cluster_addMethod {
        label="addMethod(AstraOPCUAMethodDefinition method)";
        color=navyblue;

        add_start   [ label="Start", shape=record ];
        add_append  [ label="_methods.append(method)", shape=record ];
        add_return  [ label="return", shape=record ];

        add_start  -> add_append;
        add_append -> add_return;
    }

    // -------------------------
    // 2) getOutputStructure(...) Flow
    // -------------------------
    subgraph cluster_getOutputStructure {
        label="getOutputStructure(QString methodID)";
        color=navyblue;

        get_start   [ label="Start", shape=record ];
        get_decl    [ label="Initialize QList of AstraOPCUAMethodOutputArgumentDefinition", shape=record ];
        get_for     [ label="for (auto method : _methods)", shape=record ];
        get_if      [ label="if (method.methodID == methodID)?", shape=diamond ];
        get_assign  [ label="outputStructure = method.outputArguments\nbreak", shape=record ];
        get_endfor  [ label="end for-loop", shape=record ];
        get_return  [ label="return outputStructure", shape=record ];

        get_start   -> get_decl;
        get_decl    -> get_for;
        get_for     -> get_if;
        get_if      -> get_assign   [ label="true" ];
        get_if      -> get_endfor   [ label="false" ];
        get_assign  -> get_endfor;
        get_endfor  -> get_return;
    }
}

```

##### Class diagram - Method Engine

```mermaid
classDiagram
    class AstraOPCUAMethodEngine {
        + void addMethod(AstraOPCUAMethodDefinition method)
        + QList<AstraOPCUAMethodOutputArgumentDefinition> getOutputStructure(QString methodID)
        - QList<AstraOPCUAMethodDefinition> _methods
    }
```

[↩️](#main-classes)

---

### Astra Opcua Node Engine

```graphviz {#id .class width=600px}
digraph NodeFlow {
    // Global graph styling
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        label="AstraOPCUANodeEngine important methods",
        labelloc="t",
        labeljust="c"
    ];

    // Node styling
    node [
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Edge styling
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];

    // -------------------------
    // 1) addNodeIdPair(...) Flow
    // -------------------------
    subgraph cluster_addNodeIdPair {
        label="addNodeIdPair(...)";
        color=navyblue;

        // Nodes
        add_start      [ label="Start",             shape=record ];
        add_setStatus  [ label="status = BADINTERNALERROR", shape=record ];
        add_findNode   [ label="comparisonNode = findNode(...)", shape=record ];
        add_checkNull  [ label="UA_NodeId_equal(\n &comparisonNode,\n &UA_NODEID_NULL )?", shape=diamond ];
        add_makePair   [ label="nodeIdPair = qMakePair(...)\n_nodes.append(...)\nstatus = GOOD", shape=record ];
        add_return     [ label="return status",     shape=record ];

        // Edges
        add_start     -> add_setStatus;
        add_setStatus -> add_findNode;
        add_findNode  -> add_checkNull;
        add_checkNull -> add_makePair  [ label="true" ];
        add_checkNull -> add_return    [ label="false" ];
        add_makePair  -> add_return;
    }

    // -------------------------
    // 2) findNode(...) Flow
    // -------------------------
    subgraph cluster_findNode {
        label="findNode(...)";
        color=navyblue;

        // Nodes
        fn_start     [ label="Start", shape=record ];
        fn_for       [ label="for each\nNodeIdPair in _nodes", shape=record ];
        fn_ifMatch   [ label="if (pair.second matches\nnodeName & nsIndex)?", shape=diamond ];
        fn_returnID  [ label="return\nnodeIdPair.first", shape=record ];
        fn_endFor    [ label="end for-loop", shape=record ];
        fn_returnNil [ label="return\nUA_NODEID_NULL", shape=record ];

        // Flow
        fn_start   -> fn_for;
        fn_for     -> fn_ifMatch;
        fn_ifMatch -> fn_returnID  [ label="true" ];
        fn_ifMatch -> fn_endFor    [ label="false" ];
        fn_endFor  -> fn_returnNil;
    }

    // -------------------------
    // 3) findNodeData(...) Flow
    // -------------------------
    subgraph cluster_findNodeData {
        label="findNodeData(...)";
        color=navyblue;

        // Nodes
        fnd_start    [ label="Start", shape=record ];
        fnd_setData  [ label="nodeData = (\"\",1)", shape=record ];
        fnd_checkNil [ label="UA_NodeId_equal(\n &node,\n &UA_NODEID_NULL )?", shape=diamond ];
        fnd_logNull  [ label="qWarning(...)\nreturn nodeData", shape=record ];
        fnd_for      [ label="for each\nNodeIdPair in _nodes", shape=record ];
        fnd_ifEq     [ label="if (UA_NodeId_equal(\n &pair.first,\n &node))?", shape=diamond ];
        fnd_setData2 [ label="nodeData = pair.second\nbreak", shape=record ];
        fnd_endFor   [ label="end for-loop", shape=record ];
        fnd_ifEmpty  [ label="if nodeData.first.isEmpty()?", shape=diamond ];
        fnd_warn     [ label="qWarning(...)\n\"Node not found\"", shape=record ];
        fnd_return   [ label="return nodeData", shape=record ];

        // Flow
        fnd_start    -> fnd_setData;
        fnd_setData  -> fnd_checkNil;
        fnd_checkNil -> fnd_logNull   [ label="true" ];
        fnd_checkNil -> fnd_for       [ label="false" ];
        fnd_for      -> fnd_ifEq;
        fnd_ifEq     -> fnd_setData2  [ label="true" ];
        fnd_ifEq     -> fnd_endFor    [ label="false" ];
        fnd_setData2 -> fnd_endFor;
        fnd_endFor   -> fnd_ifEmpty;
        fnd_ifEmpty  -> fnd_warn      [ label="true" ];
        fnd_ifEmpty  -> fnd_return    [ label="false" ];
        fnd_warn     -> fnd_return;
    }
}

```

##### Class diagram - Node Engine

```mermaid
classDiagram
    class AstraOPCUANodeEngine {
        - NodeRepository _nodes
        + AstraOPCUANodeEngine()
        + NodeRepository getNodes() const
        + NodeEngineStatus addNodeIdPair(UA_NodeId node, QString nodeNameString, int namespaceIndex)
        + UA_NodeId findNode(QString nodeName, int namespaceIndex)
        + NodeIdData findNodeData(UA_NodeId node)
    }

    class NodeRepository
    class NodeEngineStatus
    class UA_NodeId
    class QString
    class NodeIdData

    AstraOPCUANodeEngine --> NodeRepository : owns _nodes
    AstraOPCUANodeEngine ..> NodeEngineStatus : returns/uses
    AstraOPCUANodeEngine ..> UA_NodeId : returns/uses
    AstraOPCUANodeEngine ..> QString : uses
    AstraOPCUANodeEngine ..> NodeIdData : returns/uses
```

[↩️](#main-classes)

---

### Astra Opcua Bootstrapper

```graphviz {#id .class width=600px}
digraph Bootstrapper {
    graph [
        bgcolor="antiquewhite",

        fontsize=12,
        label="Load OPCUA config",
        labelloc="t",   // place label at top
        labeljust="c"   // center the label
    ];

    // Configure node style
    node [
        shape=record,        // record shape for UML-like boxes
        style=filled,
        fillcolor="skyblue:#0091D7",
        gradientangle=270,
        fontname="Helvetica",
        fontcolor="black",
        color=navyblue
    ];

    // Configure edges
    edge [
        color="#0091D7",
        fontname="Helvetica"
    ];

    // Class node with a static method
    "OPCUAServerBootstrapper" [
        label="{ OPCUAServerBootstrapper | + static loadConfig(path: string): AstraOPCUAServerConfig config }"
    ];

    "AstraOPCUAServerConfig" [
        label="{ AstraOPCUAServerConfig | Holds configuration data }"
    ];

    "OPCUAServerBootstrapper" -> "AstraOPCUAServerConfig" [ taillabel=<<FONT COLOR="#0091D7"><I>builds</I></FONT>>,
    labeldistance=3.5,
    labelangle=45   ];
}

```

[↩️](#main-classes)

> 💣💣💣 Currently loads the config JSON file 💣💣💣
> 📝📝📝 Move to the Routines and load via astra 📝📝📝

```mermaid
classDiagram
    class QObject
    class OPCUAServerBootstrapper {
      +AstraOPCUAServerConfig loadConfig()
    }
    struct AstraOPCUAServerConfig
    QObject <|-- OPCUAServerBootstrapper
```

[↩️](#main-classes)

---
