/**
@fileOverview
Runtime functions needed for FFI interfacing.

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010-2011 Maxime Chevalier-Boisvert, All Rights Reserved
*/

/* TODO:
Missing functions:
- allocMachineCodeBlock
- freeMachineCodeBlock
- getBlockAddr
- callTachyonFFI

Currently, allocMachineCodeBlock, in v8, returns a byte array mapped to
a real memory region. This can be accessed through the [] operator.

Can potentially create a raw FFI mapping to get the block address directly.
On top of this, we can build a proxy that allocates an object in which 
to store the memory block address. Accessor functions can be written to
address the machine code block object. Equivalent proxy code can be written
for D8.

Need to write a custom proxy for callTachyonFFI. This proxy can write
function arguments into a memory vector allocated with malloc.
*/

// If we are running inside Tachyon
if (config.inTachyon)
{
    /**
    Allocate a machine code block.
    */
    var allocMachineCodeBlock = function (size)
    {
        var blockPtr = rawAllocMachineCodeBlock(unboxInt(size));

        var blockObj = alloc_memblock();

        set_memblock_ptr(blockObj, blockPtr);
        set_memblock_size(blockObj, u32(size));

        return blockObj;
    };

    /**
    Free a machine code block.
    */
    var freeMachineCodeBlock = function (mcb)
    {
        assert (
            boolToBox(getRefTag(mcb) === TAG_OTHER),
            'invalid mcb reference'
        );

        var ptr = get_memblock_ptr(blockObj);
        var size = get_memblock_size(blockObj);

        rawFreeMachineCodeBlock(ptr, size);
    };

    /**
    Get the address of an offset into the block, expressed
    as an array of bytes.
    */
    var getBlockAddr = function (mcb, index)
    {
        assert (
            boolToBox(getRefTag(mcb) === TAG_OTHER),
            'invalid mcb reference'
        );

        var ptr = get_memblock_ptr(blockObj);
        var size = get_memblock_size(blockObj);

        assert (
            unboxInt(index) < size,
            'invalid index in mcb'
        );

        var addr = ptr + unboxInt(index);

        return ptrToByteArray(addr);
    };

    /**
    Write a byte to a machine code block.
    */
    var writeToMachineCodeBlock = function (mcb, index, byteVal)
    {
        assert (
            boolToBox(getRefTag(mcb) === TAG_OTHER),
            'invalid mcb reference'
        );

        var ptr = get_memblock_ptr(blockObj);
        var size = get_memblock_size(blockObj);

        assert (
            unboxInt(index) < size,
            'invalid index in mcb'
        );

        assert (
            byteVal > 0 && byteVal <= 255,
            'byte value out of range'
        );

        // Store the value in the block
        iir.store(IRType.u8, ptr, unboxInt(index), i8(byteVal));
    };
}

// Otherwise, if we are running inside D8
else
{
    /**
    Write a byte to a machine code block.
    */
    var writeToMachineCodeBlock = function (mcb, index, byteVal)
    {
        assert (
            byteVal > 0 && byteVal <= 255,
            'byte value out of range'
        );

        mcb[index] = byteVal;
    };
}

