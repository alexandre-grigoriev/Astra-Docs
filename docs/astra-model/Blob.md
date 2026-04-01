# **ASTRA BLOB Format Specification**

## **Overview**
The ASTRA BLOB format is a binary structure for storing multiple data blocks in shared memory or contiguous memory regions. Each block consists of a header followed by a payload. Blocks are linked sequentially using offsets.

---

## **Key Components**

### **1. BlobBlockDescriptor**
Used for describing blocks before allocation and initialization.

```cpp
struct BlobBlockDescriptor
{
  quint32 type;            // Block type ID
  quint64 size;            // Payload size (bytes)
  quint64 num;             // Number of blocks
  const void* pSourceData; // Optional source data pointer
  bool zeroMemory;         // Zero-initialize payload if true
  quint8 reserved[8];      // Reserved
};
```

**Fields:**
- **type**: Application-defined block type identifier.
- **size**: Size of payload in bytes.
- **num**: Number of blocks of this type.
- **pSourceData**: If provided, payload is copied from this pointer.
- **zeroMemory**: If `true` and `pSourceData` is `nullptr`, payload is zeroed.

---

### **2. BlobBlockHeader**
Each block starts with this header.

```cpp
#pragma pack(push, 1)
struct BlobBlockHeader
{
  static constexpr quint32 BLOCK_SIGNATURE = 0x31434241; // "ABC1" LE

  quint32 signature;  // Magic number
  quint32 type;       // Block type ID
  qint64 next;        // Offset to next block (0 if last)
  quint64 size;       // Payload size
};
#pragma pack(pop)
```

---

## **Binary Layout**
Each block is stored as:

```
Offset | Size    | Field
-------|---------|-----------------------------------
0x00   | 4 bytes | signature (0x31434241)
0x04   | 4 bytes | type (quint32)
0x08   | 8 bytes | next (qint64, offset to next block)
0x10   | 8 bytes | size (quint64, payload size)
0x18   | 8 bytes | reserved
0x20   | size    | payload (raw data)
```

**Total header size:** 24 bytes (packed).

---

### **Block Chain**
- Blocks are sequential in memory.
- `next` is the offset from the start of the current header to the next header.
- Last block has `next = 0`.

---

## **Memory Layout Example**
```
+----------------------+----------------------+----------------------+
| BlobBlockHeader      | Payload (size bytes)| BlobBlockHeader      |
| signature, type, ... | Raw data            | signature, type, ... |
+----------------------+----------------------+----------------------+
```

---

## **Initialization Rules**
- For each descriptor:
  - Create `num` blocks.
  - Set header fields: `signature`, `type`, `size`, `next`.
  - Copy `pSourceData` if provided, else zero memory if `zeroMemory` is true.
- Last block’s `next` = 0.

---

## **Utility Functions**
- `createShmem(QSharedMemory&, qsizetype size, void** ppData)`
  - Allocates shared memory of given size.
- `createShmem(QSharedMemory&, const QList<BlobBlockDescriptor>& descriptors, void** ppData)`
  - Allocates and initializes blocks based on descriptors.
- `firstBlock(void* pData, std::optional<quint64> type)`
  - Returns first block matching type.
- `nextBlock(BlobBlockHeader* pBlock, std::optional<quint64> type)`
  - Returns next block matching type.
- `getBlockData(BlobBlockHeader* pBlock)`
  - Returns pointer to payload.

---

## **Signature**
- **Magic value:** `0x31434241` (ASCII: "ABC1")
- Used for integrity checks.

---

## **Example**
### **Creating Shared Memory Blob**
```cpp
QSharedMemory shmem;
QList<BlobBlockDescriptor> descriptors = {
    {1, 1024, 1, nullptr, true}, // Block type 1, 1KB zeroed
    {2, 512, 2, someDataPtr, false} // Two blocks type 2, 512B each
};

void* pData = nullptr;
QString name = BlobUtils::createShmem(shmem, descriptors, &pData);
```

---

### **Traversing Blocks**
```cpp
auto* pBlock = BlobUtils::firstBlock(pData);
while (pBlock) {
    void* payload = BlobUtils::getBlockData(pBlock);
    // Process payload...
    pBlock = BlobUtils::nextBlock(pBlock);
}
```

---

## **Use Cases**
- Inter-process communication via shared memory.
- Efficient serialization of heterogeneous data blocks.
