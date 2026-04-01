# ASTRA JSON Hashing, Signing, and Verification Specification

## Overview

This document specifies the algorithm for calculating a hash of a JSON value, as well as the behavior of the `signJsonObject` and `checkJsonObject` functions. These utilities provide deterministic, collision-resistant signatures for JSON objects, suitable for integrity verification and lightweight authentication.

---

## 1. JSON Hashing Algorithm (`hashJson`)

### Purpose

Produce a deterministic SHA-256 hash for any JSON value, optionally seeded, such that:

- The same logical JSON value always produces the same hash.
- Object keys are sorted by UTF-8 encoding to ensure order independence.
- The hash is sensitive to all value types, including null, boolean, number, string, array, and object.

### Steps

1. **Seed Inclusion**  
   - The seed string (if provided) is serialized first as a UTF-8 string, with a type tag `'s'` and length prefix (8 bytes, big-endian).

2. **Value Serialization**  
   - Each JSON value is serialized recursively with explicit type tags:
     - `n`: null or undefined
     - `t`: boolean true
     - `f`: boolean false
     - `d`: double (IEEE 754, big-endian, -0 normalized to +0)
     - `s`: string (UTF-8, length-prefixed)
     - `a`: array (length-prefixed, elements serialized in order)
     - `o`: object (length-prefixed, keys sorted by UTF-8, each key length-prefixed, followed by value)

3. **Hashing**  
   - The serialized byte stream is hashed using SHA-256.
   - The result is returned as a lowercase hexadecimal string.

### Details

- **Object keys** are sorted by their UTF-8 encoding, not by their Unicode code points or locale.
- **Numbers**: Doubles are serialized as IEEE 754, big-endian. Negative zero (`-0`) is normalized to positive zero (`+0`).
- **Strings**: UTF-8 encoded, length-prefixed (8 bytes, big-endian).
- **Arrays**: Length-prefixed (8 bytes, big-endian), elements serialized in order.
- **Null and Undefined**: Both are tagged as `'n'` and produce the same hash.

---

## 2. Signing a JSON Object (`signJsonObject`)

### Purpose

Add a signature property to a JSON object, containing its hash (excluding the signature property itself).

### Steps

1. Remove the signature property (default `"Signature"`) from the object if present.
2. Calculate the hash using `hashJson` with the given seed.
3. Set the signature property to the resulting hash.

### Return Value

- Returns `true` if the signature property name is valid and the signature was set.
- Returns `false` if the signature property name is empty.

---

## 3. Verifying a JSON Object Signature (`checkJsonObject`)

### Purpose

Verify that the signature property of a JSON object matches its hash (excluding the signature property).

### Steps

1. Extract the signature property value.
2. Remove the signature property from a copy of the object.
3. Calculate the hash using `hashJson` with the given seed.
4. Compare the calculated hash to the extracted signature.

### Return Value

- Returns `true` if the signature matches.
- Returns `false` if the signature property name is empty or the signature does not match.

---

## 4. Examples

### Example 1: Hashing a JSON Object

```cpp
QJsonObject obj;
obj["name"] = "Alice";
obj["age"] = 30;
obj["active"] = true;
QString hash = astra::hashJson(obj); // e.g., "9965e38aec68df292ee396d702f82af3d775c8a61961e1bc3b1147d1c431cd07"
```

### Example 2: Hashing with Seed

```cpp
QString hash = astra::hashJson(obj, "mySeed");
```

### Example 3: Signing a JSON Object

```cpp
QJsonObject obj;
obj["a"] = 1;
obj["b"] = QJsonArray{true, QJsonValue::Null, 0, "x"};
obj["c"] = -0.0;
astra::signJsonObject(obj); // Adds "Signature" property
// obj["Signature"] == "4c4f07fbb58b0701fa1f11bcdb4643f75be80cf0d62ff1bee8b867efbc9565d9"
```

### Example 4: Verifying a Signed JSON Object

```cpp
bool valid = astra::checkJsonObject(obj); // Returns true if "Signature" matches
```

### Example 5: Custom Signature Property and Seed

```cpp
QJsonObject obj;
obj["a"] = 1;
obj["b"] = QJsonArray{true, QJsonValue::Null, 0, "x"};
obj["c"] = -0.0;
astra::signJsonObject(obj, "Sig", "custom seed");
// obj["Sig"] == "002991417b0b18c0635e5f4b93b47905a9ce08c16cba64e4909c2949674d30e6"
```

### Example 6: Signature Verification Failure

```cpp
QJsonObject obj;
obj["a"] = 1;
obj["b"] = "x";
astra::signJsonObject(obj, "Sig");
obj["Sig"] = "wrong";
bool valid = astra::checkJsonObject(obj, "Sig"); // Returns false
```

---

## 5. Notes

- Object keys are sorted by UTF-8 encoding before hashing.
- The signature property name is customizable.
- The seed can be used for domain separation or lightweight authentication.
- The hash is SHA-256, returned as a lowercase hexadecimal string.
- Both `null` and `undefined` JSON values produce the same hash.
- Changing any value, key, or the seed will change the hash and signature.

---