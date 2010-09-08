/**
@fileOverview
Implementation of inline IR

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

/**
Pseudo-constructor for IIR constants
*/
function IIRConst(args)
{
    assert (
        args.length == 2,
        'IIR constant expected 2 arguments'
    );

    assert (
        args[1] instanceof ConstValue,
        'IIR constant expects constant value as second argument'
    );

    var constVal = args[1].value;

    return ConstValue.getConst(constVal, args[0]);
}

/**
Object containing IR instructions usable inline inside functions
*/
iir =
{
    // Constants
    constant    : IIRConst,

    // Memory management
    load        : LoadInstr,
    store       : StoreInstr,

    // Type conversion
    unbox       : UnboxInstr,
    box         : BoxInstr,
    icast       : ICastInstr,
    itof        : IToFPInstr,
    ftoi        : FPToIInstr,

    // Branch instructions
    add_ovf     : AddOvfInstr,
    sub_ovf     : SubOvfInstr,
    mul_ovf     : MulOvfInstr
}

