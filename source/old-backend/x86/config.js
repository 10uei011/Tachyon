/* _________________________________________________________________________
 *
 *             Tachyon : A Self-Hosted JavaScript Virtual Machine
 *
 *
 *  This file is part of the Tachyon JavaScript project. Tachyon is
 *  distributed at:
 *  http://github.com/Tachyon-Team/Tachyon
 *
 *
 *  Copyright (c) 2011, Universite de Montreal
 *  All rights reserved.
 *
 *  This software is licensed under the following license (Modified BSD
 *  License):
 *
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are
 *  met:
 *    * Redistributions of source code must retain the above copyright
 *      notice, this list of conditions and the following disclaimer.
 *    * Redistributions in binary form must reproduce the above copyright
 *      notice, this list of conditions and the following disclaimer in the
 *      documentation and/or other materials provided with the distribution.
 *    * Neither the name of the Universite de Montreal nor the names of its
 *      contributors may be used to endorse or promote products derived
 *      from this software without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 *  IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 *  TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 *  PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL UNIVERSITE DE
 *  MONTREAL BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 *  PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 *  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 *  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * _________________________________________________________________________
 */

/**
@fileOverview
Backend specific configuration for x86

@author
Maxime Chevalier-Boisvert, Erick Lavoie

@copyright
Copyright (c) 2010-2011 Tachyon Javascript Engine, All Rights Reserved
*/

/**
@class x86 backend configuration
*/
function x86BackendCfg(is64bit)
{
    if (is64bit === undefined)
    {
        is64bit = false;
    }

    const that = this;
    const reg = oldx86.Assembler.prototype.register;
    const mem = oldx86.Assembler.prototype.memory;
    const width = is64bit ? 64 : 32;
    const refByteNb = width >> 3;

    /**
    Register holding stack
    @field
    */
    this.stack   = reg.rsp.subReg(width);

    /**
    Register holding the context object
    @field
    */
    this.context = reg.rcx.subReg(width);

    /**
    Layout for the context object
    @field
    */
    this.ctxLayout = null;

    /**
    Registers available for register allocation.
    @field
    */
    this.physReg = [reg.rax.subReg(width), 
                    reg.rbp.subReg(width),
                    reg.rdx.subReg(width),
                    reg.rsi.subReg(width),
                    reg.rdi.subReg(width)];

    /**
    Register index for call's return value
    @field
    */
    this.retValIndex = 0;

    /** 
    Register indexes for the corresponding CallInstr operands. The first
    operands will be assigned those registers in their order of 
    appearance. The remaining operands will be passed on the stack.
    The first position corresponds to arg 0 index, the second to arg 1, etc.
    @field
    */
    this.argsIndex = [2, 1, 0, 3];

    //For convenience in the ir-to-asm code, references to registers
    //are derived from the retValIndex and argsIndex 

    /** 
    Register for call's return value
    @field
    */
    this.retValReg = this.physReg[this.retValIndex];

    /**
    Registers for operands of CallInstr
    @field
    */
    this.argsReg = this.argsIndex.map(function (index) { 
        return that.physReg[index]; 
    });

    /**
    Registers possibly available as scratch registers during
    function calls operations
    @field
    */
    this.nonArgsReg = this.physReg.slice(0);
    arraySetRemAll(this.nonArgsReg, this.argsReg);


    /** 
    Register to be used for the function pointer during a call
    @field
    */
    this.funcPtrReg = this.physReg[this.physReg.length - 1];

    /**
    Temporary location in the context for cases where all registers are in use
    @field
    */
    this.tempName = 'temp';

    /**
    Stack alignement number of bytes
    Mandatory to be compatible with Mach OS X ABI function call convention
    @field
    */
    this.stackAlignByteNb = 16;

    /**
    Register type for register allocation
    @field
    */
    this.REG = oldx86.type.REG;

    /**
    Memory slot type for register allocation
    @field
    */
    this.MEM = oldx86.type.MEM;

    /**
    Registers used for passing arguments in x64 calling convention
    @field
    */
    this.x64ArgsReg = [reg.rdi, reg.rsi, reg.rdx, reg.rcx, reg.r8, reg.r9];


    // FIXME: Remove scratch register when the register allocator 
    //        correctly supports allocating a scratch register only
    //        for instructions that need it.
    /**
    Scratch register
    @field
    */
    this.scratchReg = reg.rbx.subReg(width);

    /**
    Number of implementation related arguments used in a call.
    @field
    */
    this.implArgsRegNb = 2;

    

    // Configuration sanity checks
    assert(
        !arraySetHas(this.argsReg, this.funcPtrReg),
        "Invalid funcPtr register"
    );

    assert(
        !arraySetHas(this.argsReg, this.scratch) && 
        !arraySetHas(this.physReg, this.scratch) &&
        !arraySetHas(this.x64ArgsReg, this.scratch),
        "Invalid scratch register"
    );

    assert(
        this.scratchReg !== this.funcPtrReg,
        "scratch and funcPtr registers must be distinct"
    );

    assert(
        this.scratchReg !== reg.rax.subReg(width) &&
        this.scratchReg !== reg.rdx.subReg(width),
        "xAX and xDX are reserved for multiplication and division"
    );

    assert(
        this.context === reg.rax.subReg(width) ||
        this.context === reg.rbx.subReg(width) || 
        this.context === reg.rcx.subReg(width) || 
        this.context === reg.rdx.subReg(width),
        "Invalid register for context object"
    );

    assert(
        this.nonArgsReg.length >= 1,
        "At least one physical register should not be used " + 
        "for passing arguments and ffi calls on 32 bits"
    );

    assert(
        this.argsReg.length >= 3,
        "prelude: allocating the argument table requires a calling" + 
        " convention passing at least 3 arguments in registers"
    );
         

    if (is64bit)
    {
        assert(!arraySetHas(this.x64ArgsReg, this.stack.subReg(width)),
               "Stack register conflicts with x64 calling convention");
    }
}

/**
Creates the layout for the context object used by the backend and 
assigns it to the ctxLayout field.
*/
x86BackendCfg.prototype.makeContextLayout = function (params)
{
    /**
    Run-time context layout object
    */
    var ctxLayout = new MemLayout("x86ctx", IRType.ref, undefined, params);

    // Number of arguments passed to the function
    ctxLayout.addField(
        "numargs",
        IRType.pint
    );

    // Argument table for constructing the argument object
    ctxLayout.addField(
        "argtbl",
        IRType.ref
    );

    // Temporary slot for Memory to Memory moves
    ctxLayout.addField(
        'temp',
        IRType.box
    );

    // Slots to spill arguments that might be in registers
    this.physReg.forEach(function (reg, index) {
        ctxLayout.addField(
            'reg' + index,
            IRType.box
        );
    });



    // Finalize the context layout
    ctxLayout.finalize();

    this.ctxLayout = ctxLayout;
};

/**
Get a context memory field.
*/
x86BackendCfg.prototype.getCtxField = function (name)
{
    const mem = oldx86.Assembler.prototype.memory;
    const fieldOffset = this.ctxLayout.getFieldOffset([name]);
    return mem(fieldOffset, this.context);
};

/**
Sanity checks run after the initialization is completed.
*/
x86BackendCfg.prototype.validate = function (params)
{
    const ctxAlign = params.staticEnv.getBinding("CTX_ALIGN").value;
    assert(ctxAlign === 256, "Invalid alignment value for context object");
};


/**
x86, 32-bit configuration
*/
Target.x86_32 = new Target({
    backend         : 'backendX86',
    backendCfg      : new x86BackendCfg(false),
    endian          : 'little',
    ptrSizeBits     : 32
});

/**
x86, 64-bit configuration
*/
Target.x86_64 = new Target({
    backend         : 'backendX86',
    backendCfg      : new x86BackendCfg(true),
    endian          : 'little',
    ptrSizeBits     : 64
});


