/**
@fileOverview
Implementation of the memory representation of objects.

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

// FIXME: some variables are currently defined globally here because from
// inside V8, we cannot access a previously defined static environment. This
// will no longer be a problem once Tachyon is bootstrapped.
var MAX_FIXNUM = Math.pow(2, 30) - 1;

//
// TODO: separate object-related code from tag bit code, string code, etc.
// This will make it easier to switch object representations.
//

/**
Initialize the definitions related to objects and object layouts for this
architecture
*/
function makeObjectLayouts(params)
{
    //=============================================================================
    //
    // Tag bit constants for boxed values
    //
    // These constants should have type platform-int, matching the box type size
    //
    // Tags needed:
    // - immediate int      X-----X00   0
    // - object             X----X111   7
    // - function obj       X----X110   6
    // - array obj          X----X101   5
    // - float              X----X011   3
    // - string             X----X010   2
    // - other              X----X001   1
    //   - constants (true/false/null/undef)
    //   - other heap objects (getter-setter, hash table, etc.)
    //
    // Immediate integer tags have only two tag bits so they can be used directly
    // in 32-bit array indexing. The resulting immediate integers have 30 
    // effective usable bits.
    //
    //=============================================================================

    // Number of integer tag bits
    params.staticEnv.regBinding(
        'TAG_NUM_BITS_INT',
        ConstValue.getConst(
            2,
            IRType.pint
        )
    );

    // Number of usable integer bits in a boxed integer
    params.staticEnv.regBinding(
        'BOX_NUM_BITS_INT',
        ConstValue.getConst(
            IRType.pint.getSizeBits(params.target) - 
            params.staticEnv.getBinding('TAG_NUM_BITS_INT').value,
            IRType.pint
        )
    );

    // Number of reference tag bits
    params.staticEnv.regBinding(
        'TAG_NUM_BITS_REF',
        ConstValue.getConst(
            3,
            IRType.pint
        )
    );

    // Mask used to extract immediate integer tags
    params.staticEnv.regBinding(
        'TAG_INT_MASK',
        ConstValue.getConst(
            3,
            IRType.pint
        )
    );

    // Mask used to extract reference tags
    params.staticEnv.regBinding(
        'TAG_REF_MASK',
        ConstValue.getConst(
            7,
            IRType.pint
        )
    );

    // Tag for immediate integers
    params.staticEnv.regBinding(
        'TAG_INT',
        ConstValue.getConst(
            0,
            IRType.pint
        )
    );

    // Tag for plain objects
    params.staticEnv.regBinding(
        'TAG_OBJECT',
        ConstValue.getConst(
            7,
            IRType.pint
        )
    );

    // Tag for function objects
    params.staticEnv.regBinding(
        'TAG_FUNCTION',
        ConstValue.getConst(
            6,
            IRType.pint
        )
    );

    // Tag for array objects
    params.staticEnv.regBinding(
        'TAG_ARRAY',
        ConstValue.getConst(
            5,
            IRType.pint
        )
    );

    // Tag for floating-point values
    params.staticEnv.regBinding(
        'TAG_FLOAT',
        ConstValue.getConst(
            3,
            IRType.pint
        )
    );

    // Tag for strings
    params.staticEnv.regBinding(
        'TAG_STRING',
        ConstValue.getConst(
            2,
            IRType.pint
        )
    );

    // Tag for other values
    params.staticEnv.regBinding(
        'TAG_OTHER',
        ConstValue.getConst(
            1,
            IRType.pint
        )
    );

    //=============================================================================
    //
    // GC and memory management constants
    //
    //=============================================================================

    // Alignment for heap allocation
    params.staticEnv.regBinding(
        'HEAP_ALIGN',
        ConstValue.getConst(
            8,
            IRType.pint
        )
    );

    //=============================================================================
    //
    // JavaScript constant values and misc. constants
    //
    // Each constant has a specific bit-pattern:
    // - true       000--0|000|001  1
    // - false      000--0|001|001  9
    // - null       000--0|010|001  17
    // - undefined  000--0|011|001  25
    // - not found  000--0|100|001  33
    //
    //=============================================================================

    // Bit pattern for the true constant
    params.staticEnv.regBinding(
        'BIT_PATTERN_TRUE',
        ConstValue.getConst(
            1,
            IRType.pint
        )
    );

    // Bit pattern for the false constant
    params.staticEnv.regBinding(
        'BIT_PATTERN_FALSE',
        ConstValue.getConst(
            9,
            IRType.pint
        )
    );

    // Bit pattern for the null constant
    params.staticEnv.regBinding(
        'BIT_PATTERN_NULL',
        ConstValue.getConst(
            17,
            IRType.pint
        )
    );

    // Bit pattern for the undefined constant
    params.staticEnv.regBinding(
        'BIT_PATTERN_UNDEF',
        ConstValue.getConst(
            25,
            IRType.pint
        )
    );

    // Bit pattern for the not found constant
    params.staticEnv.regBinding(
        'BIT_PATTERN_NOT_FOUND',
        ConstValue.getConst(
            33,
            IRType.pint
        )
    );

    // True boolean constant
    params.staticEnv.regBinding(
        'TRUE_BOOL',
        ConstValue.getConst(
            1,
            IRType.bool
        )
    );

    // False boolean constant
    params.staticEnv.regBinding(
        'FALSE_BOOL',
        ConstValue.getConst(
            0,
            IRType.bool
        )
    );

    // Undefined constant
    params.staticEnv.regBinding(
        'UNDEFINED',
        ConstValue.getConst(
            undefined,
            IRType.box
        )
    );

    // Null pointer constant
    params.staticEnv.regBinding(
        'NULL_PTR',
        ConstValue.getConst(
            0,
            IRType.rptr
        )
    );

    //=============================================================================
    //
    // Object memory layout
    //
    //=============================================================================

    /**
    Hash table entry layout object
    */
    var hashEntryLayout = new MemLayout('hashentry', undefined, undefined, params);

    // Hash table key
    hashEntryLayout.addField(
        'key',
        IRType.box
    );

    // Hash table value
    hashEntryLayout.addField(
        'val',
        IRType.box
    );

    // Finalize the hash table entry layout
    hashEntryLayout.finalize();

    /**
    Hash table entry layout object
    */
    var hashTblLayout = new MemLayout('hashtbl', IRType.box, 'TAG_OTHER', params);

    //
    // TODO: header
    //

    // Hash table entries
    hashTblLayout.addField(
        'tbl',
        hashEntryLayout,
        undefined,
        false
    );

    // Finalize the hash table layout
    hashTblLayout.finalize();

    /**
    Object layout object
    */
    var objLayout = new MemLayout('obj', IRType.box, 'TAG_OBJECT', params);

    //
    // TODO: header
    //

    // Prototype reference
    objLayout.addField(
        'proto',
        IRType.box
    );

    // Hash table
    objLayout.addField(
        'tbl',
        IRType.box
    );

    // Hash table size
    objLayout.addField(
        'tblsize',
        IRType.i32
    );

    // Number of properties
    objLayout.addField(
        'numprops',
        IRType.i32
    );

    // Finalize the object layout
    objLayout.finalize();

    // Initial hash map size
    params.staticEnv.regBinding(
        'HASH_MAP_INIT_SIZE',
        ConstValue.getConst(
            11,
            IRType.pint
        )
    );

    // Hash map max load factor (num/denom)
    params.staticEnv.regBinding(
        'HASH_MAP_MAX_LOAD_NUM',
        ConstValue.getConst(
            3,
            IRType.pint
        )
    );
    params.staticEnv.regBinding(
        'HASH_MAP_MAX_LOAD_DENOM',
        ConstValue.getConst(
            5,
            IRType.pint
        )
    );

    //=============================================================================
    //
    // String memory layout
    //
    //=============================================================================

    /**
    String layout object
    */
    var strLayout = new MemLayout('str', IRType.box, 'TAG_STRING', params);

    //
    // TODO: header
    //

    // String length
    strLayout.addField(
        'len',
        IRType.i32
    );

    // Precomputed hash code
    strLayout.addField(
        'hash',
        IRType.i32
    );

    // Character data (UTF-16)
    strLayout.addField(
        'data',
        IRType.u16,
        undefined,
        false
    );

    // Finalize the string layout
    strLayout.finalize();

    //=============================================================================
    //
    // String table layout (hash consing)
    //
    //=============================================================================

    /**
    Hash table entry layout object
    */
    var strTblLayout = new MemLayout('strtbl', IRType.box, 'TAG_OTHER', params);

    //
    // TODO: header
    //

    // String table size
    strTblLayout.addField(
        'tblsize',
        IRType.i32
    );

    // Number of strings
    strTblLayout.addField(
        'numstrs',
        IRType.i32
    );

    // String table entries
    strTblLayout.addField(
        'tbl',
        IRType.box,
        undefined,
        false
    );

    // Finalize the string table layout
    strTblLayout.finalize();

    // Initial string table size
    params.staticEnv.regBinding(
        'STR_TBL_INIT_SIZE',
        ConstValue.getConst(
            101,
            IRType.pint
        )
    );

    // String table max load factor (num/denum)
    params.staticEnv.regBinding(
        'STR_TBL_MAX_LOAD_NUM',
        ConstValue.getConst(
            3,
            IRType.pint
        )
    );
    params.staticEnv.regBinding(
        'STR_TBL_MAX_LOAD_DENOM',
        ConstValue.getConst(
            5,
            IRType.pint
        )
    );

    //=============================================================================
    //
    // Mutable closure cell memory layout
    //
    //=============================================================================

    /**
    Mutable cell layout object
    */
    var cellLayout = new MemLayout('cell', IRType.box, 'TAG_OTHER', params);

    //
    // TODO: header
    //

    // String length
    cellLayout.addField(
        'val',
        IRType.box
    );

    // Finalize the cell layout
    cellLayout.finalize();
}
