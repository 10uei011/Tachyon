/**
@fileOverview
Implementation of the Foreign Function Interface (FFI) to interface with
the C/C++ code required by Tachyon.

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010-2011 Maxime Chevalier-Boisvert, All Rights Reserved
*/

/**
Base class for mapping of Tachyon types to C types.
*/
function CTypeMapping()
{
    /**
    Name of the C type
    */
    this.cTypeName = null;

    /**
    IR type matching the C type
    */
    this.cIRType = null;

    /**
    IR type of the Tachyon value
    */
    this.jsIRType = null;

    /**
    Flag to indicate we should free produced values
    @field
    */
    this.freeAfterSnd = false;

    /**
    Flag to indicate we should free received values
    @field
    */
    this.freeAfterRcv = false;
}
CTypeMapping.prototype = {};

/**
Representation of the C void type.
*/
function CVoid()
{
    this.cTypeName = 'void';

    this.cIRType = IRType.none;

    this.jsIRType = IRType.none;
}
CVoid.prototype = new CTypeMapping();

/**
Conversion of boxed values to C string types and vice-versa.
*/
function CStringAsBox(freeRcv)
{
    // By default, C strings received as return values will be freed
    if (freeRcv === undefined)
        freeRcv = true;

    this.cTypeName = 'char*';

    this.cIRType = IRType.rptr;

    this.jsIRType = IRType.box;

    this.freeAfterSnd = true;

    this.freeAfterRcv = freeRcv;
}
CStringAsBox.prototype = new CTypeMapping();

/**
Generate code for a conversion to a C value
*/
CStringAsBox.prototype.jsToC = function (inVar)
{
    return 'boxToCString(' + inVar + ')';
};

/**
Generate code for a conversion from a C value
*/
CStringAsBox.prototype.cToJS = function (inVar)
{
    return 'cStringToBox(' + inVar + ')';
};

/**
Generate to free a C string value
*/
CStringAsBox.prototype.free = function (inVar)
{
    return 'free(' + inVar + ')';
};

/**
Conversion of boxed integers to C integers and vice-versa.
*/
function CIntAsBox()
{
    this.cTypeName = 'int';

    this.cIRType = IRType.pint;

    this.jsIRType = IRType.box;
}
CIntAsBox.prototype = new CTypeMapping();

/**
Generate code for a conversion to a C value
*/
CIntAsBox.prototype.jsToC = function (inVar)
{
    return 'unboxInt(' + inVar + ')';
};

/**
Generate code for a conversion from a C value
*/
CIntAsBox.prototype.cToJS = function (inVar)
{
    return 'boxInt(' + inVar + ')';
};

/**
C integer to raw IR integer type. The IR type can be specified on construction
or on conversion.
*/
function CIntAsInt(irIntType)
{
    assert (
        irIntType === undefined || irIntType instanceof IRType,
        'Invalid IR integer type specified'
    );

    if (irIntType !== undefined)

    this.cTypeName = 'int';

    this.cIRType = IRType.pint;

    this.jsIRType = irIntType;
}
CIntAsInt.prototype = new CTypeMapping();

/**
Generate code for a conversion to a C value
*/
CIntAsInt.prototype.jsToC = function (inVar)
{
    return 'iir.icast(IRType.' + this.cIRType + ', ' + inVar + ')';
};

/**
Generate code for a conversion from a C value
*/
CIntAsInt.prototype.cToJS = function (inVar, jsIRType)
{
    assert (
        this.jsIRType !== undefined || jsIRType !== undefined,
        'JS IR type not specified'
    );

    jsIRType = (jsIRType !== undefined)? jsIRType:this.jsIRType;

    return 'iir.icast(IRType.' + jsIRType + ', ' + inVar + ')';
};

/**
Conversion of pointers to byte arrays and vice-versa.
*/
function CPtrAsBytes()
{
    this.cTypeName = 'void*';

    this.cIRType = IRType.rptr;

    this.jsIRType = IRType.box;
}
CPtrAsBytes.prototype = new CTypeMapping();

//
// TODO: conversion functions
//

/**
C pointer to raw IR pointer type.
*/
function CPtrAsPtr()
{
    this.cTypeName = 'void*';

    this.cIRType = IRType.rptr;

    this.jsIRType = IRType.rptr;
}
CPtrAsPtr.prototype = new CTypeMapping();

/**
Generate code for a conversion to a C value
*/
CPtrAsPtr.prototype.jsToC = function (inVar)
{
    return inVar;
};

/**
Generate code for a conversion from a C value
*/
CPtrAsPtr.prototype.cToJS = function (inVar)
{
    return inVar;
};
















/**
Convert from a C type name to the corresponding C type
*/
function cTypeToIRType(cType, params)
{
    switch (cType)
    {
        case 'short':
        return IRType.i16;

        case 'unsigned short':
        return IRType.u16;

        case 'int':
        return IRType.pint;

        case 'char*':
        case 'void*':
        return IRType.rptr;

        case 'void':
        return IRType.none;

        default:
        error('unsupported C type: ' + cType);        
    }
}

/**
Generate a code string to perform a type conversion
*/
function genTypeConv(inType, outType, cTypeName, inVar)
{
    if (inType === outType)
        return inVar;

    switch (inType)
    {
        case IRType.box:
        switch (outType)
        {
            case IRType.pint:
            return 'unboxInt(' + inVar + ')';

            case IRType.rptr:
            switch (cTypeName)
            {
                case 'void*':
                return 'iir.icast(IRType.rptr,' + inVar + ')';

                case 'char*':
                return 'boxToCString(' + inVar + ')';
            }
            break;

            case IRType.i16:
            return 'iir.icast(IRType.i16, unboxInt(' + inVar + '))';
            
            case IRType.u16:
            return 'iir.icast(IRType.u16, unboxInt(' + inVar + '))';
        }
        break;

        case IRType.pint:
        switch (outType)
        {
            case IRType.box:
            return 'boxInt(' + inVar + ')';
        }
        break;

        case IRType.i16:
        switch (outType)
        {
            case IRType.box:
            return 'boxInt(iir.icast(IRType.i16, ' + inVar + '))';
        }
        break;
        
        case IRType.u16:
        switch (outType)
        {
            case IRType.box:
            return 'boxInt(iir.icast(IRType.u16, ' + inVar + '))';
        }
        break;

        /*        
        TODO: char* to box string conversions
        case IRType.rptr:
        {
            case IRType.box:
            return 'TODO';
        }
        break;
        */
    }

    assert (
        false,
        'cannot convert from ' + inType + ' to ' + outType
    );
}

/**
Represents a C FFI function
*/
function CFunction(
    funcName,
    argTypes,
    retType,
    params
)
{
    assert (
        argTypes instanceof Array && retType !== undefined,
        'invalid arguments or return type'
    );
    assert (
        params instanceof CompParams,
        'expected compilation parameters'
    );

    for (var i = 0; i < argTypes.length; ++i)
    {
        assert (
            argTypes[i].jsIRType instanceof IRType,
            'invalid argument type'
        );
    }

    assert (
        retType.jsIRType instanceof IRType,
        'invalid return type'
    );

    /**
    Name of the C function
    @field
    */
    this.funcName = funcName;

    /**
    Argument type mappings
    @field
    */
    this.argTypes = argTypes;

    /**
    Return type mapping
    @field
    */
    this.retType = retType;

    /**
    Address of the C function
    @field
    */
    this.funcPtr = asm.address(getFuncAddr(funcName));
}
CFunction.prototype = new IRValue();

/**
Return the IR value name for this function
*/
CFunction.prototype.getValName = function ()
{
    return '<c-ffi' + (this.funcName? (' "' + this.funcName + '"'):'') + '>';
};

/**
Obtain a string representation of the function
*/
CFunction.prototype.toString = CFunction.prototype.getValName;

/**
Generate code for a wrapper function for a C FFI function
*/
CFunction.prototype.genWrapper = function ()
{
    // Source string to store the generated code
    var sourceStr = '';

    sourceStr += 'function ' + this.funcName + '(';

    for (var i = 0; i < this.argTypes.length; ++i)
    {
        sourceStr += 'a' + i;        
        if (i !== this.argTypes.length - 1)
            sourceStr += ', ';
    }

    sourceStr += ')\n';
    sourceStr += '{\n';
    sourceStr += '\t"tachyon:static";\n';
    sourceStr += '\t"tachyon:noglobal";\n';
    sourceStr += '\t"tachyon:ret ' + this.retType.jsIRType + '";\n';

    for (var i = 0; i < this.argTypes.length; ++i)
    {
        var argType = this.argTypes[i].jsIRType;
        sourceStr += '\t"tachyon:arg a' + i + ' ' + argType + '";\n';
    }

    // Generate type conversions
    for (var i = 0; i < this.argTypes.length; ++i)
    {
        var argType = this.argTypes[i];
        var varName = 'a' + i;

        sourceStr += '\t' + varName + ' = ';
        sourceStr += argType.jsToC(varName) + ';\n';
    }
    
    var retVoid = (this.retType instanceof CVoid);

    sourceStr += '\t' + ((retVoid === true)? '':'var r = ') + 'iir.call_ffi(ffi_' + this.funcName;

    for (var i = 0; i < this.argTypes.length; ++i)
    {
        sourceStr += ', a' + i;
    }

    sourceStr += ');\n';

    // Free allocated C strings, if any
    for (var i = 0; i < this.argTypes.length; ++i)
    {
        var argType = this.argTypes[i];

        if (argType.freeAfterSnd !== true)
            continue;

        var varName = 'a' + i;

        sourceStr += '\t' + argType.free(varName) + ';\n';
    }

    // If we are returning a value
    if (retVoid === false)
    {
        // Convert the return value
        sourceStr += '\tvar rJS = ' + this.retType.cToJS('r') + ';\n';

        if (this.retType.freeAfterRcv === true)
        {
            sourceStr += '\t' + this.retType.free('r') + ';\n';
        }

        sourceStr += '\treturn rJS;\n';        
    }
    else
    {
        sourceStr += '\treturn;\n';
    }

    sourceStr += '}\n';

    //print(sourceStr);

    // Return the generated code
    return sourceStr;
};

/**
@class Represents a proxy function callable from C for a Tachyon function
*/
function CProxy(
    irFunction,
    params,
    cArgTypes,
    cRetType,
    ctxVal
)
{
    assert (
        irFunction instanceof IRFunction,
        'expected IR function'
    );

    // The types presented to C must be specified
    assert (
        cArgTypes instanceof Array && cRetType !== undefined,
        'invalid C argument types or return type'
    );
    
    assert (
        params instanceof CompParams,
        'expected compilation parameters'
    );

    assert (
        irFunction.argTypes.length === cArgTypes.length,
        'C argument types do not match function argument types'
    );

    assert (
        ctxVal instanceof ConstValue ||
        ctxVal === undefined,
        'invalid context value'
    );

    // For now, assume the context is always passed as an argument
    assert (
        ctxVal === undefined,
        'cannot pre-specify fixed context'
    );

    // Convert the C argument types to IR types
    var cArgIRTypes = cArgTypes.map(function (t) { return cTypeToIRType(t, params); });

    // Convert the C return type to an IR type
    var cRetIRType = cTypeToIRType(cRetType, params);

    // If the context should be passed as an argument, make the first
    // C argument a void pointer
    if (ctxVal === undefined)
        cArgIRTypes.unshift(IRType.rptr);

    // Find a free global name to call the function through
    var funcName = findFreeName(
        function (n) { return params.staticEnv.hasBinding(n); }, 
        irFunction.funcName + '_tproxy'
    );

    // Bind the function in the static environment
    params.staticEnv.regBinding(funcName, irFunction);

    /**
    Tachyon function to be wrapped by this proxy
    @field
    */
    this.irFunction = irFunction;    

    /**
    Global name to call the function through
    @field
    */
    this.funcName = funcName;

    /**
    Argument types of the C function
    @field
    */
    this.cArgTypes = cArgTypes;

    /**
    Return type of the C function
    @field
    */
    this.cRetType = cRetType;

    /**
    IR types for the argument types of the C function
    @field
    */
    this.cArgIRTypes = cArgIRTypes;

    /**
    IR type for the return type of the C function
    @field
    */
    this.cRetIRType = cRetIRType;

    /**
    Context pointer to be used. May be undefined if
    the context is to be passed by argument.
    @field
    */
    this.ctxVal = ctxVal;

    /**
    Compilation parameters to be used when compiling the proxy
    @field
    */
    this.params = params;
}
CProxy.prototype = {};

/**
Generate the proxy function
*/
CProxy.prototype.genProxy = function ()
{
    // Source string to store the generated code
    var sourceStr = '';

    var funcName = 'cproxy_' + this.irFunction.funcName;

    sourceStr += 'function ' + funcName + '(';

    if (this.ctxVal === undefined)
    {
        sourceStr += 'ctx';

        if (this.irFunction.argTypes.length > 0)
            sourceStr += ', ';
    }

    for (var i = 0; i < this.irFunction.argTypes.length; ++i)
    {
        sourceStr += 'a' + i;        
        if (i !== this.irFunction.argTypes.length - 1)
            sourceStr += ', ';
    }

    sourceStr += ')\n';
    sourceStr += '{\n';
    sourceStr += '\t"tachyon:cproxy";\n';
    sourceStr += '\t"tachyon:ret ' + this.cRetIRType + '";\n';

    if (this.ctxVal === undefined)
    {
        sourceStr += '\t"tachyon:arg ctx rptr";\n';
    }

    for (var i = 0; i < this.irFunction.argTypes.length; ++i)
    {
        var argType = this.cArgIRTypes[
            this.cArgIRTypes.length - this.irFunction.argTypes.length + i
        ];

        sourceStr += '\t"tachyon:arg a' + i + ' ' + argType + '";\n';
    }
    
    if (this.ctxVal === undefined)
    {
        sourceStr += '\tiir.set_ctx(ctx);\n';
    }

    // Get the global object from the context if available
    sourceStr += '\tvar global = ';
    if (this.ctxVal === undefined)
        sourceStr += '(ctx !== NULL_PTR)? get_ctx_globalobj(ctx):UNDEFINED';
    else
        sourceStr += 'UNDEFINED';
    sourceStr += ';\n';

    // Convert the types of function arguments
    for (var i = 0; i < this.irFunction.argTypes.length; ++i)
    {
        var cType = this.cArgTypes[
            this.cArgTypes.length - this.irFunction.argTypes.length + i
        ];
        var cIRType = this.cArgIRTypes[
            this.cArgIRTypes.length - this.irFunction.argTypes.length + i
        ];
        var tType = this.irFunction.argTypes[i];

        if (cType === tType)
            continue;

        var varName = 'a' + i;

        sourceStr += '\t' + varName + ' = ';
        sourceStr += genTypeConv(cIRType, tType, cType, varName) + ';\n';
    }
    
    var retVoid = this.cRetIRType === IRType.none;

    sourceStr += '\t' + ((retVoid === true)? '':'var r = ') + 'iir.call(';
    sourceStr += this.funcName + ', UNDEFINED, global';

    for (var i = 0; i < this.irFunction.argTypes.length; ++i)
    {
        sourceStr += ', ' + 'a' + i;
    }

    sourceStr += ');\n';

    //sourceStr += '\tprintInt(13372);\n';

    if (retVoid === false)
    {
        sourceStr += '\treturn ' + genTypeConv(this.irFunction.retType, this.cRetIRType, this.cRetType, 'r') + ';\n';
    }
    else
    {
        sourceStr += '\treturn;';
    }
    
    //sourceStr += 'return iir.icast(IRType.pint, 7);';

    sourceStr += '}\n';
    
    //print(sourceStr);

    // Compile the source string into an IR function
    var func = compileSrcString(sourceStr, this.params);

    // Return the compiled function
    return func.childFuncs[0];
};

/**
Create a bridge to call a compiled Tachyon function through V8
*/
function makeBridge(
    irFunction,
    params,
    cArgTypes,
    cRetType
)
{
    assert (
        params instanceof CompParams,
        'expected compilation parameters'
    );

    // Generate a proxy for the function
    var proxy = new CProxy(
        irFunction,
        params,
        cArgTypes,
        cRetType
    );
    
    var wrapper = proxy.genProxy();

    //print(wrapper);
    
    // Get pointer to entry point of compiled wrapper function
    var funcAddr = wrapper.linking.getEntryPoint('default').getAddr();

    // Callable bridge function
    function bridge(ctxPtr)
    {
        //print(ctxPtr);
        //print(funcAddr.getBytes());

        var argArray = [];
        for (var i = 1; i < arguments.length; ++i)
            argArray.push(arguments[i]);

        var result = callTachyonFFI.apply(
            null,
            [
                cArgTypes,
                cRetType,
                funcAddr.getBytes(),
                ctxPtr
            ].concat(argArray)
        );

        //print(result);

        return result;
    };

    return bridge;
}

/**
Initialize FFI functions for the current configuration
*/
function initFFI(params)
{
    function regFFI(ffiFunc)
    {
        params.ffiFuncs[ffiFunc.funcName] = ffiFunc;
        params.staticEnv.regBinding('ffi_' + ffiFunc.funcName, ffiFunc);
    }

    regFFI(new CFunction(
        'malloc', 
        [new CIntAsInt(IRType.pint)], 
        new CPtrAsPtr(),
        params
    ));

    regFFI(new CFunction(
        'free', 
        [new CPtrAsPtr()],
        new CVoid(),
        params
    ));

    regFFI(new CFunction(
        'exit', 
        [new CIntAsBox()],
        new CVoid(),
        params
    ));

    regFFI(new CFunction(
        'puts',
        [new CStringAsBox()], 
        new CIntAsBox(),
        params
    ));

    regFFI(new CFunction(
        'shellCommand',
        [new CStringAsBox()], 
        new CStringAsBox(),
        params
    ));

    regFFI(new CFunction(
        'printInt', 
        [new CIntAsBox()],
        new CVoid(),
        params
    ));

    regFFI(new CFunction(
        'sum2Ints', 
        [new CIntAsBox(), new CIntAsBox()],
        new CIntAsBox(),
        params
    ));
}

