/**
@fileOverview
Implementation of high-level IR instructions through handler functions

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

//=============================================================================
//
// Primitive functions to operate on boxed values
//
//=============================================================================

/**
Box an integer value
*/
function boxInt(intVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:arg intVal pint";

    // Box the integer
    return iir.icast(IRType.box, intVal << TAG_NUM_BITS_INT);
}

/**
Unbox an integer value
*/
function unboxInt(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret pint";

    // Unbox the integer
    return iir.icast(IRType.pint, boxVal) >> TAG_NUM_BITS_INT;
}

/**
Box a reference value
*/
function boxRef(rawPtr, tagVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:arg rawPtr rptr";
    "tachyon:arg tagVal pint";

    // Box the raw pointer
    return iir.icast(IRType.box, rawPtr | tagVal);
}

/**
Unbox a reference value
*/
function unboxRef(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret rptr";

    // Box the raw pointer
    return iir.icast(IRType.rptr, boxVal & ~TAG_REF_MASK);
}

/**
Get the reference tag of a boxed value
*/
function getRefTag(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret pint";

    // Mask out the non-tag part
    return boxVal & TAG_REF_MASK;
}

/**
Test if a boxed value has a specific reference tag
*/
function boxHasTag(boxVal, tagVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:arg tagVal pint";
    "tachyon:ret bool";

    // Compare the reference tag
    return getRefTag(boxVal) === tagVal;
}

/**
Test if a boxed value is integer
*/
function boxIsInt(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret bool";

    // Test if the value has the int tag
    return (boxVal & TAG_INT_MASK) === TAG_INT;
}

/**
Test if a boxed value is an object
*/
function boxIsObj(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret bool";

    // Compare the reference tag
    return getRefTag(boxVal) >= TAG_ARRAY;
}

/**
Test if a boxed value is a function
*/
function boxIsFunc(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret bool";

    /* TODO
    // Compare the reference tag
    return getRefTag(boxVal) === TAG_FUNCTION;
    */

    // FIXME: for now, function pointers not boxed, this will not work
    return TRUE_BOOL;
}

/**
Test if a boxed value is an array
*/
function boxIsArray(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret bool";

    // Compare the reference tag
    return getRefTag(boxVal) === TAG_ARRAY;
}

/**
Test if a boxed value is a floating-point value
*/
function boxIsFloat(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret bool";

    // Compare the reference tag
    return getRefTag(boxVal) === TAG_FLOAT;
}

/**
Test if a boxed value is a string
*/
function boxIsString(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret bool";

    // Compare the reference tag
    return getRefTag(boxVal) === TAG_STRING;
}

/**
Convert a boxed value to a one-byte boolean value
*/
function boxToBool(boxVal)
{
    "tachyon:static";
    "tachyon:nothrow";
    "tachyon:noglobal";
    "tachyon:ret bool";

    // Get an integer-typed value for input
    var boxInt = iir.icast(IRType.pint, boxVal);

    if (boxInt === BIT_PATTERN_TRUE)
        return TRUE_BOOL;

    else if (boxInt === BIT_PATTERN_FALSE)
        return FALSE_BOOL;

    else if (boxInt === BIT_PATTERN_UNDEF)
        return FALSE_BOOL;

    else if (boxInt === BIT_PATTERN_NULL)
        return FALSE_BOOL;

    else if (boxIsInt(boxVal))
    { 
        if (boxInt !== pint(0))
            return TRUE_BOOL;
        else
            return FALSE_BOOL;
    }

    else if (boxIsString(boxVal))
    {
        var len = iir.icast(IRType.pint, get_str_len(boxVal));

        if (len !== pint(0))
            return TRUE_BOOL;
        else
            return FALSE_BOOL;
    }

    return TRUE_BOOL;
}

/**
Convert a boolean value to a boxed boolean value
*/
function boolToBox(boolVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:arg boolVal bool";

    return boolVal? true:false;
}

/**
Cast a boxed integer value to the pint type
*/
function pint(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret pint";

    // Unbox the integer directly
    return unboxInt(boxVal);
}

/**
Cast a boxed integer value to the i32 type
*/
function i32(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret i32";

    // Unbox the integer and cast it
    return iir.icast(IRType.i32, unboxInt(boxVal));
}

/**
Cast a boxed integer value to the u32 type
*/
function u32(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret u32";

    // Unbox the integer and cast it
    return iir.icast(IRType.u32, unboxInt(boxVal));
}

/**
Cast a boxed integer value to the i16 type
*/
function i16(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret i16";

    // Unbox the integer and cast it
    return iir.icast(IRType.i16, unboxInt(boxVal));
}

/**
Cast a boxed integer value to the u16 type
*/
function u16(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret u16";

    // Unbox the integer and cast it
    return iir.icast(IRType.u16, unboxInt(boxVal));
}

/**
Cast a boxed integer value to the i8 type
*/
function i8(boxVal)
{
    "tachyon:inline";
    "tachyon:nothrow";
    "tachyon:ret i8";

    // Unbox the integer and cast it
    return iir.icast(IRType.i8, unboxInt(boxVal));
}

//=============================================================================
//
// Utility functions
//
//=============================================================================

/**
Allocate a memory block of a given size on the heap
*/
function heapAlloc(size)
{
    "tachyon:static";
    "tachyon:noglobal";
    "tachyon:arg size pint";
    "tachyon:ret rptr";

    // Get a pointer to the context
    var ctx = iir.get_ctx();

    // Get the current allocation pointer
    var allocPtr = get_ctx_allocptr(ctx);

    // Increment the allocation pointer by the object size
    var nextPtr = allocPtr + size;

    // Align the next allocation pointer
    var rem = iir.icast(IRType.pint, nextPtr) % HEAP_ALIGN;
    if (rem !== pint(0))
    {
        var pad = HEAP_ALIGN - rem;
        nextPtr += pad;
    }
    
    // Update the allocation pointer in the context object
    set_ctx_allocptr(ctx, nextPtr);

    /************** TEMPORARY ************/
    var startPtr = iir.get_ctx();
    var oldSize = allocPtr - startPtr;
    var newSize = nextPtr - startPtr;
    var nextStep = oldSize;
    var rem = iir.icast(IRType.pint, oldSize) % pint(1024);
    if (rem !== pint(0))
    {
        var pad = pint(1024) - rem;
        nextStep += pad;
    }
    if (newSize > nextStep && newSize / pint(1024) > pint(10))
    {
        var newSize = newSize / pint(1024);
        print("Heap alloc: " + boxInt(newSize) + "KB");

    }
    /************** TEMPORARY ************/

    // Allocate the object at the current position
    return allocPtr;
}

/**
Create an exception with a given constructor
*/
function makeError(errorCtor, message)
{
    "tachyon:static";
    "tachyon:nothrow";

    // FIXME: for now, constructors and exceptions unsupported
    error(message);

    //return new errorCtor(message);
}

//=============================================================================
//
// Implementation of JavaScript primitives (IR instructions)
//
//=============================================================================

// TODO: implement the following primitives
function typeOf(obj) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function instanceOf(obj, ctor) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function delPropVal(obj, propName) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function getPropNames(obj) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function makeClos(funcObj) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function putClos(clos, idx, val) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function getClos(clos, idx) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function makeArgObj(funcObj) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function newArray() { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function not(v) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function and(v1, v2) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function or(v1, v2) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function xor(v1, v2) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function lsft(v1, v2) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function rsft(v1, v2) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function ursft(v1, v2) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function logNot(v) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }
function inOp(x, y) { "tachyon:static"; "tachyon:nothrow"; return UNDEFINED; }

/**
Create a new object with no properties
*/
function newObject(proto)
{
    "tachyon:static";
    "tachyon:nothrow";
    "tachyon:noglobal";

    // Allocate space for an object
    var obj = alloc_obj();

    // Initialize the prototype object
    set_obj_proto(obj, proto);

    // Initialize the hash table size and number of properties
    set_obj_tblsize(obj, iir.icast(IRType.i32, HASH_MAP_INIT_SIZE));
    set_obj_numprops(obj, i32(0));

    // Initialize the hash table pointer to null to prevent GC errors
    set_obj_tbl(obj, null);

    // Allocate space for a hash table and set the hash table reference
    var hashtbl = alloc_hashtbl(HASH_MAP_INIT_SIZE);
    set_obj_tbl(obj, hashtbl);

    // Initialize the hash table
    for (var i = pint(0); i < HASH_MAP_INIT_SIZE; i += pint(1))
    {
        set_hashtbl_tbl_key(hashtbl, i, UNDEFINED);
    }

    // Return the object reference
    return obj;
}

/**
Create a mutable closure cell
*/
function makeCell() 
{ 
    "tachyon:static";
    "tachyon:nothrow";
    "tachyon:noglobal";

    /*
    // Allocate space for the cell
    var cell = alloc_cell();

    return cell;
    */

    // TODO
    return UNDEFINED;
}

/**
Store a value in a mutable cell
*/
function putCell(cell, val)
{ 
    "tachyon:static";
    "tachyon:nothrow";
    "tachyon:noglobal";

    // TODO
    //put_cell_val(cell, val);
}

/**
Read a value from a mutable cell
*/
function getCell(cell) 
{ 
    "tachyon:static";
    "tachyon:nothrow";
    "tachyon:noglobal";

    //return get_cell_val(cell);

    // TODO
    return UNDEFINED;
}

/**
Implementation of HIR less-than instruction
*/
function lt(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Compare the immediate integers directly without unboxing them
        var tv = iir.lt(v1, v2);
    }
    else
    {
        // Call a function for the general case
        var tv = ltGeneral(v1, v2);
    }

    return tv? true:false;
}

/**
Non-inline case for HIR less-than instruction
*/
function ltGeneral(v1, v2)
{
    "tachyon:static";
    "tachyon:nothrow";
    "tachyon:ret bool";

    // TODO
    return FALSE_BOOL;
}

/**
Implementation of HIR less-than-or-equal instruction
*/
function le(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Compare the immediate integers directly without unboxing them
        var tv = iir.le(v1, v2);
    }
    else
    {
        // Call a function for the general case
        var tv = leGeneral(v1, v2);
    }

    return tv? true:false;
}

/**
Implementation of HIR greater-than instruction
*/
function gt(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Compare the immediate integers directly without unboxing them
        var tv = iir.gt(v1, v2);
    }
    else
    {
        // Call a function for the general case
        var tv = gtGeneral(v1, v2);
    }

    return tv? true:false;
}

/**
Implementation of HIR greater-than-or-equal instruction
*/
function ge(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Compare the immediate integers directly without unboxing them
        var tv = iir.ge(v1, v2);
    }
    else
    {
        // Call a function for the general case
        var tv = geGeneral(v1, v2);
    }

    return tv? true:false;
}

/**
Implementation of HIR eq instruction
*/
function eq(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Compare the immediate integers directly without unboxing them
        return iir.eq(v1, v2)? true:false;
    }
    else
    {
        // TODO: implement general case in separate (non-inlined) function
        return UNDEFINED;
    }
}

/**
Implementation of HIR ne instruction
*/
function ne(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Compare the immediate integers directly without unboxing them
        return iir.ne(v1, v2)? true:false;
    }
    else
    {
        // TODO: implement general case in separate (non-inlined) function
        return UNDEFINED;
    }
}

/**
Implementation of HIR strict-equality instruction
*/
function seq(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are floating-point
    if (boxHasTag(v1, TAG_FLOAT) && boxHasTag(v2, TAG_FLOAT))
    {
        // TODO: implement FP case in separate(non-inlined) function
        return UNDEFINED;
    }
    else
    {
        // Compare the boxed value directly without unboxing them
        // This will compare for equality of reference in the case of
        // references and compare immediate integers directly
        return iir.eq(v1, v2)? true:false;
    }
}

/**
Implementation of HIR strict-inequality instruction
*/
function nseq(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are floating-point
    if (boxHasTag(v1, TAG_FLOAT) && boxHasTag(v2, TAG_FLOAT))
    {
        // TODO: implement FP case in separate(non-inlined) function
        return UNDEFINED;
    }
    else
    {
        // Compare the boxed value directly without unboxing them
        // This will compare for inequality of reference in the case of
        // references and compare immediate integers directly
        return iir.ne(v1, v2)? true:false;
    }
}

/**
Implementation of the HIR add instruction
*/
function add(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Attempt an add with overflow check
        var intResult;
        if (intResult = iir.add_ovf(v1, v2))
        {
            // If there is no overflow, return the result
            // No normalization necessary
            return intResult;
        }
        else
        {
            // Overflow handling: need to create FP objects
            return addOverflow(v1, v2);
        }
    }
    else
    {
        // Call general case in separate (non-inlined) function
        return addGeneral(v1, v2);
    }
}

/**
Non-inline overflow case for HIR add instruction
*/
function addOverflow(v1, v2)
{
    "tachyon:static";
    "tachyon:nothrow";

    // TODO
    return UNDEFINED;
}

/**
Non-inline general case for HIR add instruction
*/
function addGeneral(v1, v2)
{
    "tachyon:static";
    "tachyon:nothrow";

    // If the left value is a string
    if (boxIsString(v1))
    {
        // If the right value is not a string
        if (boxIsString(v2) === FALSE_BOOL)
        {
            // Convert the right value to a string
            v2 = boxToString(v2);
        }

        // Perform string concatenation
        return strcat(v1, v2);
    }

    // If the right value is a string
    else if (boxIsString(v2))
    {
        // Convert the left value to a string
        v1 = boxToString(v1);

        // Perform string concatenation
        return strcat(v1, v2);
    }

    // TODO
    return UNDEFINED;
}

/**
Implementation of the HIR sub instruction
*/
function sub(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";
    
    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Attempt a subtract with overflow check
        var intResult;
        if (intResult = iir.sub_ovf(v1, v2))
        {
            // If there is no overflow, return the result
            // No normalization necessary
            return intResult;
        }
        else
        {
            // Overflow handling: need to create FP objects
            return subOverflow(v1, v2);
        }
    }
    else
    {
        // Call general case in separate (non-inlined) function
        return subGeneral(v1, v2);
    }
}

/**
Non-inline overflow case for HIR sub instruction
*/
function subOverflow(v1, v2)
{
    "tachyon:static";
    "tachyon:nothrow";

    // TODO
    return UNDEFINED;
}

/**
Non-inline general case for HIR sub instruction
*/
function subGeneral(v1, v2)
{
    "tachyon:static";
    "tachyon:nothrow";

    // TODO
    return UNDEFINED;
}

/**
Implementation of the HIR mul instruction
*/
function mul(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Attempt a multiply with overflow check
        var intResult;
        if (intResult = iir.mul_ovf(v1, v2))
        {
            // If there is no overflow, return the result
            // Normalize by shifting right by the number of integer tag bits
            return iir.icast(IRType.box, intResult >> TAG_NUM_BITS_INT);
        }
        else
        {
            // TODO: overflow handling: need to create FP objects
            return UNDEFINED;
        }    
    }
    else
    {
        // TODO: implement general case in separate (non-inlined) function
        return UNDEFINED;
    }
}

/**
Implementation of the HIR div instruction
*/
function div(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Perform a raw machine division
        // The tag bits will cancel out
        var divRes = iir.div(v1, v2);

        // Box the result value
        return boxInt(divRes);
    }
    else
    {
        // TODO: implement general case in separate (non-inlined) function
        return UNDEFINED;
    }
}

/**
Implementation of the HIR div instruction
*/
function mod(v1, v2)
{
    "tachyon:inline";
    "tachyon:nothrow";

    // If both values are immediate integers
    if (boxIsInt(v1) && boxIsInt(v2))
    {
        // Perform a raw machine modulo
        // The tag bits will not cancel out
        return iir.mod(v1, v2);
    }
    else
    {
        // TODO: implement general case in separate (non-inlined) function
        return UNDEFINED;
    }
}

/**
Get the hash value for a given string or integer key
*/
function getHash(key)
{
    "tachyon:inline";
    "tachyon:ret pint";

    // TODO: assert int or string
    // toPrimitive...

    // If the property is integer
    if (boxIsInt(key))
    {    
        // Unbox the integer key
        return unboxInt(key);
    }

    // Otherwise, the key is a string
    else
    {
        // Read the hash code from the string object
        return iir.icast(IRType.pint, get_str_hash(key));
    }
}

/**
Set a property on an object
*/
function putProp(obj, propName, propHash, propVal)
{
    "tachyon:inline";
    "tachyon:noglobal";
    "tachyon:arg propHash pint";

    //printInt(13371);
    //printInt(propName);
    //printInt(boxInt(propHash));
    //print("prop set");
    //print(propName);

    //
    // TODO: find if getter-setter exists?
    // Requires first looking up the entry in the whole prototype chain...
    //

    // Get a pointer to the hash table
    var tblPtr = get_obj_tbl(obj);

    // Get the size of the hash table
    var tblSize = iir.icast(
        IRType.pint,
        get_obj_tblsize(obj)
    );

    // Get the hash table index for this hash value
    // compute this using unsigned modulo to always obtain a positive value
    var hashIndex = iir.icast(
        IRType.pint,
        iir.icast(IRType.u32, propHash) % iir.icast(IRType.u32, tblSize)
    );

    //printInt(boxInt(hashIndex));

    // Until the key is found, or a free slot is encountered
    while (true)
    {
        // Get the key value at this hash slot
        var keyVal = get_hashtbl_tbl_key(tblPtr, hashIndex);

        // If this is the key we want
        if (keyVal === propName)
        {
            // Set the corresponding property value
            set_hashtbl_tbl_val(tblPtr, hashIndex, propVal);

            // Break out of the loop
            break;
        }

        // Otherwise, if we have reached an empty slot
        else if (keyVal === UNDEFINED)
        {
            // Set the corresponding key and value in the slot
            set_hashtbl_tbl_key(tblPtr, hashIndex, propName);
            set_hashtbl_tbl_val(tblPtr, hashIndex, propVal);

            // Get the number of properties and increment it
            var numProps = get_obj_numprops(obj);
            numProps += i32(1);
            set_obj_numprops(obj, numProps);
            numProps = iir.icast(IRType.pint, numProps);

            // Test if resizing of the hash map is needed
            // numProps > ratio * tblSize
            // numProps > num/denom * tblSize
            // numProps * denom > tblSize * num
            if (numProps * HASH_MAP_MAX_LOAD_DENOM >
                tblSize * HASH_MAP_MAX_LOAD_NUM)
            {
                // Extend the hash table for this object
                extObjHashTable(obj, tblPtr, tblSize);
            }

            // Break out of the loop
            break;
        }

        // Move to the next hash table slot
        hashIndex = (hashIndex + pint(1)) % tblSize;
    }
}

/**
Extend the hash table and rehash the properties of an object
*/
function extObjHashTable(obj, curTbl, curSize)
{
    "tachyon:inline";
    "tachyon:noglobal";
    "tachyon:arg curSize pint";

    // Compute the new table size
    var newSize = curSize * pint(2) + pint(1);

    // Allocate a new, larger hash table
    var newTbl = alloc_hashtbl(newSize);

    // Initialize the keys in the new hash table
    for (var i = pint(0); i < newSize; i += pint(1))
    {
        set_hashtbl_tbl_key(newTbl, i, UNDEFINED);
    }

    // For each entry in the current table
    for (var curIdx = pint(0); 
         curIdx < curSize; 
         curIdx = curIdx + pint(1)
    )
    {
        // Get the key at this hash slot
        var propKey = get_hashtbl_tbl_key(curTbl, curIdx);

        // If this is an empty hash entry, skip it
        if (propKey === UNDEFINED)
            continue;

        // Get the value at this hash slot
        var propVal = get_hashtbl_tbl_val(curTbl, curIdx);

        // Get the hash code for the property
        // Boxed value, may be a string or an int
        var propHash = getHash(propKey);

        // Get the hash table index for this hash value in the new table
        // compute this using unsigned modulo to always obtain a positive value
        var startHashIndex = iir.icast(
            IRType.pint,
            iir.icast(IRType.u32, propHash) % iir.icast(IRType.u32, newSize)
        );
        var hashIndex = startHashIndex;

        // Until a free slot is encountered
        while (true)
        {
            // Get the key value at this hash slot
            var slotKey = get_hashtbl_tbl_key(newTbl, hashIndex);

            // If we have reached an empty slot
            if (slotKey === UNDEFINED)
            {
                // Set the corresponding key and value in the slot
                set_hashtbl_tbl_key(newTbl, hashIndex, propKey);
                set_hashtbl_tbl_val(newTbl, hashIndex, propVal);

                // Break out of the loop
                break;
            }

            // Move to the next hash table slot
            hashIndex = (hashIndex + pint(1)) % newSize;

            // Ensure that a free slot was found for this key
            assert (
                boolToBox(hashIndex !== startHashIndex),
                'no free slots found in extended hash table'
            );
        }
    }

    // Update the hash table pointer and the table size for the object
    set_obj_tbl(obj, newTbl);
    set_obj_tblsize(obj, iir.icast(IRType.i32, newSize));
}

/**
Get a property from an object
*/
function getProp(obj, propName, propHash)
{
    "tachyon:inline";
    "tachyon:noglobal";
    "tachyon:arg propHash pint";

    //print("prop lookup");
    //print(propName);

    // Until we reach the end of the prototype chain
    do
    {
        // Get a pointer to the hash table
        var tblPtr = get_obj_tbl(obj);

        // Get the size of the hash table
        var tblSize = iir.icast(
            IRType.pint,
            get_obj_tblsize(obj)
        );

        // Get the hash table index for this hash value
        // compute this using unsigned modulo to always obtain a positive value
        var hashIndex = iir.icast(
            IRType.pint,
            iir.icast(IRType.u32, propHash) % iir.icast(IRType.u32, tblSize)
        );

        //printInt(boxInt(hashIndex));

        // Until the key is found, or a free slot is encountered
        while (true)
        {
            // Get the key value at this hash slot
            var keyVal = get_hashtbl_tbl_key(tblPtr, hashIndex);

            // If this is the key we want
            if (keyVal === propName)
            {
                // Load the property value
                var propVal = get_hashtbl_tbl_val(tblPtr, hashIndex);

                /*
                if (isGetterSetter(propVal))
                    return callGetter(obj, propVal);
                else 
                    return propVal;
                */

                // TODO
                return propVal;
            }

            // Otherwise, if we have reached an empty slot
            else if (keyVal === UNDEFINED)
            {
                break;
            }

            // Move to the next hash table slot
            hashIndex = (hashIndex + pint(1)) % tblSize;
        }

        // Move up in the prototype chain
        var obj = get_obj_proto(obj);

    } while (obj !== null);

    // Property not found, return a special bit pattern
    return iir.icast(IRType.box, BIT_PATTERN_NOT_FOUND);
}

/**
Set a property on an object, by property name value
*/
function putPropVal(obj, propName, propVal)
{
    "tachyon:static";
    "tachyon:noglobal";

    // TODO: throw error if not object
    // - Maybe not, should never happen in practice... toObject
    // - What we actually want is a debug assertion

    // Get the hash code for the property
    // Boxed value, may be a string or an int
    var propHash = getHash(propName);

    // Set the property on the object
    putProp(obj, propName, propHash, propVal);
}

/**
Test if a property exists on an object
*/
function hasPropVal(obj, propName)
{
    "tachyon:static";
    "tachyon:noglobal";
    "tachyon:ret bool";

    // TODO: throw error if not object
    // - Maybe not, should never happen in practice... toObject
    // - What we actually want is a debug assertion

    // Get the hash code for the property
    // Boxed value, may be a string or an int
    var propHash = getHash(propName);

    // Attempt to find the property on the object
    var prop = getProp(obj, propName, propHash);

    // Test if the property was found
    return (iir.icast(IRType.pint, prop) !== BIT_PATTERN_NOT_FOUND);
}

/**
Get a property from an object
*/
function getPropVal(obj, propName)
{
    "tachyon:static";
    "tachyon:noglobal";

    // TODO: throw error if not object
    // - Maybe not, should never happen in practice... toObject
    // - What we actually want is a debug assertion

    // Get the hash code for the property
    // Boxed value, may be a string or an int
    var propHash = getHash(propName);

    // Attempt to find the property on the object
    var prop = getProp(obj, propName, propHash);

    // If the property isn't defined
    if (iir.icast(IRType.pint, prop) === BIT_PATTERN_NOT_FOUND)
    {
        // Return the undefined value
        return UNDEFINED;
    }

    // Return the property value we found
    return prop;
}

/**
Get a property value from the global object
*/
function getGlobal(obj, propName, propHash)
{
    "tachyon:static";
    "tachyon:arg propHash pint";

    // Attempt to find the property on the object
    var prop = getProp(obj, propName, propHash);

    // If the property isn't defined
    if (iir.icast(IRType.pint, prop) === BIT_PATTERN_NOT_FOUND)
    {
        // Throw a ReferenceError exception
        throw makeError(ReferenceError, "global property not defined" + propName);
    }

    // Return the property
    return prop;
}

/**
Get a function property from the global object
*/
function getGlobalFunc(obj, propName, propHash)
{
    "tachyon:static";
    "tachyon:arg propHash pint";

    // Attempt to find the property on the object
    var prop = getProp(obj, propName, propHash);

    // If the property is a function
    if (boxIsFunc(prop))
    {
        // Return the function property
        return prop;
    }
    else
    {
        // If the property isn't defined
        if (iir.icast(IRType.pint, prop) === BIT_PATTERN_NOT_FOUND)
        {
            // Throw a ReferenceError exception
            throw makeError(ReferenceError, "global property not defined" + propName);
        }
        else
        {
            // Throw a TypeError exception
            throw makeError(TypeError, "global property is not a function" + propName);
        }
    }
}

