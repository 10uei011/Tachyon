/**
@fileOverview
Class hierarchy for Intermediate Representation (IR) instructions

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

// TODO: function assignments on prototypes

// TODO: semicolons after function assignments

// TODO: function argument instructions/values (arg N)
// TODO: argument object instruction/value (argObject)
// TODO: this value instruction/value (thisValue)
// Could be created in entry block on CFG creation
// - Proper instructions, with uses
// - Easy to replace during inlining
// Have CFG take parent function as constructor parameter
// - Create these when creating initial CFG
// - have getArg(n), etc., functions as part of CFG class

/**
@class Base class for all IR values
*/
function IRValue()
{
    /**
    Get a string representation of a value's name
    */
    this.getValName = function () { return 'value' };

    /**
    Produce a string representation of this value
    */
    this.toString = this.getValName;
}

/**
@class Represents constant values in the IR
@augments IRInstr
*/
function ConstValue()
{
    /**
    Default toString() implementation for constant instructions
    */
    this.toString = function() { return String(this.value); };

    /**
    Get a string representation of an instruction's value/name.
    Returns the constant's string representation directly.
    */
    this.getValName = this.toString;
}
ConstValue.prototype = new IRValue();

/**
@class Null constant value
@augments ConstValue
*/
function NullConst()
{
   this.value = null;
}
NullConst.prototype = new ConstValue();

/**
@class Undefined constant value
@augments ConstValue
*/
function UndefConst()
{
   this.value = undefined;
}
UndefConst.prototype = new ConstValue();

/**
@class Boolean constant value
@augments ConstValue
*/
function BoolConst(value)
{
    assert (typeof value == 'boolean', 'boolean constant value must be boolean');

    this.value = value;
}
BoolConst.prototype = new ConstValue();

/**
@class Integer constant value
@augments ConstValue
*/
function IntConst(value)
{
    assert (value - Math.floor(value) == 0, 'integer constant value must be integer');

    this.value = value;
}
IntConst.prototype = new ConstValue();

/**
@class Floating-point constant value
@augments ConstValue
*/
function FPConst(value)
{
    assert (typeof value == 'number', 'floating-point constant value must be number');

    this.value = value;
}
FPConst.prototype = new ConstValue();

/**
@class String constant value
@augments ConstValue
*/
function StrConst(value)
{
    /**
    Get a string representation of a string constant
    */
    this.toString = function() { return '"' + escapeJSString(this.value) + '"'; };

    /**
    Get a string representation of an instruction's value/name.
    Returns the constant's string representation directly.
    */
    this.getValName = this.toString;

    assert (typeof value == 'string', 'string constant value must be string');

    this.value = value;
}
StrConst.prototype = new ConstValue();

/**
@class Object reference constant value
@augments ConstValue
*/
function ObjRefConst(obj)
{
   this.value = obj;
}
ObjRefConst.prototype = new ConstValue();




















/**
@class Base class for all IR instructions
*/
function IRInstr()
{
    /**
    Produce a string representation of this instruction
    */
    this.toString = function ()
    {
        var output = "";

        // If this instruction's value is read, print its output name
        if (this.hasDests())
            output += this.getValName() + ' = ';

        output += this.mnemonic + ' ';

        for (i = 0; i < this.uses.length; ++i)
        {
            var ins = this.uses[i];

            output += ins.getValName();

            if (ins != this.uses[this.uses.length - 1])            
                output += ", ";
        }

        return output;
    };

    /**
    Get a string representation of an instruction's value/name
    */
    this.getValName = function ()
    {
        // If the output name for this instruction is set
        if (this.outName)
        {
            // Return the output/temporary name
            return this.outName;
        }
        else
        {
            // Return a name based on the instruction id number
            return '$t_' + this.instrId;
        }
    };

    /**
    Copy the instruction's generic properties
    */
    this.baseCopy = function (newInstr)
    {
        // Copy the mnemonic name
        newInstr.mnemonic = this.mnemonic;

        // Copy the output name
        newInstr.outName = this.outName;

        // Copy the instruction id
        newInstr.instrId = this.instrId;

        // The new instruction is orphaned
        newInstr.parentBlock = null;

        return newInstr;
    };

    /**
    Add a new use
    */
    this.addUse = function (use)
    {
        // Create an instance-specific array when necessary
        if (this.uses.length == 0)
            this.uses = [use];
        else
            this.uses.push(use);
    };

    /**
    Remove a use by index
    */
    this.remUse = function (index)
    {
        this.uses.splice(index, 1);
    };

    /**
    Replace a use
    */
    this.replUse = function (oldUse, newUse)
    {
        for (var i = 0; i < this.uses.length; ++i)
        {
            if (this.uses[i] === oldUse)
                this.uses[i] = newUse;
        }
    };

    /**
    Add a new destination
    */
    this.addDest = function (dest)
    {
        if (this.dests.length == 0)
            this.dests = [dest];
        else
            arraySetAdd(this.dests, dest);
    };

    /**
    Remove a destination
    */
    this.remDest = function (dest)
    {
        arraySetRem(this.dests, dest);
    };

    /**
    Replace a destination
    */
    this.replDest = function (oldDest, newDest)
    {
        for (var i = 0; i < this.dests.length; ++i)
        {
            if (this.dests[i] === oldDest)
                this.dests[i] = newdest;
        }
    };

    /**
    Test if this instruction's output is read (has uses)
    */
    this.hasDests = function () { return this.dests.length > 0; };

    /**
    Mnemonic name for this instruction    
    @field
    */
    this.mnemonic = "";

    /**
    Name of this instruction's output
    @field
    */
    this.outName = "";

    /**
    Id number for this instruction
    @field
    */
    this.instrId = 0;

    /**
    Values used/read by this instruction
    @field
    */
    this.uses = [];

    /**
    List of instructions reading this instruction's output
    @field
    */
    this.dests = [];

    /**
    Parent basic block
    @field
    */
    this.parentBlock = null;
}
IRInstr.prototype = new IRValue();

/**
@class SSA phi node instruction
@augments IRInstr
*/
function PhiInstr(values)
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new PhiInstr(this.uses.slice(0));
        return this.baseCopy(newInstr);
    }

    // Set the mnemonic name for this instruction
    this.mnemonic = "phi";

    /**
    Inputs to the phi node
    @field
    */
    this.uses = values;
}
PhiInstr.prototype = new IRInstr();

/**
Arithmetic operator kinds
*/
ArithOp =
{
    ADD: 0,
    SUB: 1,
    MUL: 2,
    DIV: 3,
    MOD: 4
};

/**
@class Class for arithmetic instructions
@augments IRInstr
*/
function ArithInstr(arithOp, leftVal, rightVal)
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new ArithInstr(this.arithOp, this.uses[0], this.uses[1]);
        return this.baseCopy(newInstr);
    }

    // Set the mnemonic name for the instruction
    switch (arithOp)
    {
        case ArithOp.ADD: this.mnemonic = "add"; break;
        case ArithOp.SUB: this.mnemonic = "sub"; break;
        case ArithOp.MUL: this.mnemonic = "mul"; break;
        case ArithOp.DIV: this.mnemonic = "div"; break;
        case ArithOp.MOD: this.mnemonic = "mod"; break;
    }

    /**
    Arithmetic operator
    @field
    */
    this.arithOp = arithOp;

    /**
    Arithmetic operands
    @field
    */
    this.uses = [leftVal, rightVal];
}
ArithInstr.prototype = new IRInstr();

/**
Bitwise operator kinds
*/
BitOp =
{
    AND:    0,
    OR:     1,
    XOR:    2,
    NOT:    3,
    LSFT:   4,
    RSFT:   5,
    RSFTU:  6
};

/**
@class Class for bitwise instructions
@augments IRInstr
*/
function BitInstr(bitOp, leftVal, rightVal)
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new BitInstr(this.bitOp, this.uses[0], this.uses[1]);
        return this.baseCopy(newInstr);
    }

    // Set the mnemonic name for the instruction
    switch (bitOp)
    {
        case ArithOp.AND:   this.mnemonic = "and";      break;
        case ArithOp.OR:    this.mnemonic = "or";       break;
        case ArithOp.XOR:   this.mnemonic = "xor";      break;
        case ArithOp.NOT:   this.mnemonic = "not";      break;
        case ArithOp.LSFT:  this.mnemonic = "lsft";     break;
        case ArithOp.RSFT:  this.mnemonic = "rsft";     break;
        case ArithOp.RSFTU: this.mnemonic = "rsftu";    break;
    }

    /**
    Arithmetic operator
    @field
    */
    this.bitOp = bitOp;

    /**
    Arithmetic operands
    @field
    */
    this.uses = [leftVal, rightVal];
}
BitInstr.prototype = new IRInstr();

/**
Comparison operator kinds
*/
CompOp =
{
    LT:     0,
    LTE:    1,
    GT:     2,
    GTE:    3,
    EQ:     4,
    NE:     5,
    SEQ:    6,
    NSEQ:   7
};

/**
@class Class for comparison instructions
@augments IRInstr
*/
function CompInstr(compOp, leftVal, rightVal)
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new CompInstr(this.compOp, this.uses[0], this.uses[1]);
        return this.baseCopy(newInstr);
    }

    // Set the mnemonic name for the instruction
    switch (compOp)
    {
        case ArithOp.LT:    this.mnemonic = "lt";   break;
        case ArithOp.LTE:   this.mnemonic = "lte";  break;
        case ArithOp.GT:    this.mnemonic = "gt";   break;
        case ArithOp.GTE:   this.mnemonic = "gte";  break;
        case ArithOp.EQ:    this.mnemonic = "eq";   break;
        case ArithOp.NE:    this.mnemonic = "ne";   break;
        case ArithOp.SEQ:   this.mnemonic = "seq";  break;
        case ArithOp.NSEQ:  this.mnemonic = "nseq"; break;
    }

    /**
    Comparison operator
    @field
    */
    this.compOp = compOp;

    /**
    Arithmetic operands
    @field
    */
    this.uses = [leftVal, rightVal];
}
CompInstr.prototype = new IRInstr();

/**
@class Property set with value for field name
@augments IRInstr
*/
function SetPropValInstr(objVal, nameVal)
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new SetPropValInstr(this.uses[0], this.uses[1]);
        return this.baseCopy(newInstr);
    }

    // Set the mnemonic name for this instruction
    this.mnemonic = 'setprop_val';

    /**
    Object and field name values
    @field
    */
    this.uses = [objVal, nameVal];
}
SetPropValInstr.prototype = new IRInstr();

/**
@class Property get with value for field name
@augments IRInstr
*/
function GetPropValInstr(objVal, nameVal)
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new GetPropValInstr(this.uses[0], this.uses[1]);
        return this.baseCopy(newInstr);
    }

    // Set the mnemonic name for this instruction
    this.mnemonic = 'getprop_val';

    /**
    Object and field name values
    @field
    */
    this.uses = [objVal, nameVal];
}
GetPropValInstr.prototype = new IRInstr();

/**
@class Base class for branching instructions.
@augments IRInstr
*/
function BranchInstr()
{
    /**
    Potential branch target basic blocks
    @field
    */
    this.targets = [];
}
BranchInstr.prototype = new IRInstr();

/**
@class Unconditional jump instruction
@augments BranchInstr
*/
function JumpInstr(targetBlock)
{
    /**
    Obtain a string representation
    */
    this.toString = function() { return "jump " + this.targets[0].getBlockName(); }

    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new JumpInstr(this.targets[0]);
        return this.baseCopy(newInstr);
    }

    /**
    Target basic block
    @field
    */
    this.targets = [targetBlock];
}
JumpInstr.prototype = new BranchInstr();

/**
@class If conditional test instruction
@augments BranchInstr
*/
function IfInstr(testVal, trueBlock, falseBlock)
{
    /**
    Obtain a string representation
    */
    this.toString = function()
    {
        return  "if " + this.uses[0].getValName() +
                " then " + this.targets[0].getBlockName() +
                " else " + this.targets[1].getBlockName()
        ;
    }

    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new IfInstr(this.uses[0], this.targets[0], this.targets[1]);
        return this.baseCopy(newInstr);
    }

    /**
    Test value for the branch condition
    @field
    */
    this.uses = [testVal];

    /**
    Branch targets for the true and false cases
    @field
    */
    this.targets = [trueBlock, falseBlock];
}
IfInstr.prototype = new BranchInstr();

/**
@class Function return instruction
@augments BranchInstr
*/
function RetInstr(retVal)
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new RetInstr(this.uses[0]);
        return this.baseCopy(newInstr);
    }

    // Set the mnemonic name for this instruction
    this.mnemonic = 'ret';

    /**
    Return value, can be undefined
    @field
    */
    this.uses = [retVal];
}
RetInstr.prototype = new BranchInstr();

/**
@class Exception throw to exception handler. Handler may be left undefined for
interprocedural throw.
@augments BranchInstr
*/
function ThrowInstr(excVal, catchBlock)
{
    /**
    Produce a string representation of the throw instruction
    */
    this.toString = function ()
    {
        var output = 'throw ' + excVal.getValName();

        if (this.targets[0] != null)
            output += 'to ' + this.targets[0].getBlockName();

        return output;
    }

    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new ThrowInstr(this.uses[0], this.targets[0]);
        return this.baseCopy(newInstr);
    }

    // Set the target block if a catch block is specified
    if (catchBlock == undefined)
        catchBlock = null;

    /**
    Exception value to be thrown
    @field
    */
    this.uses = [excVal];

    /**
    Catch block for this throw, may be null if unspecified
    @field
    */
    this.targets = [catchBlock];
}
ThrowInstr.prototype = new BranchInstr();

/**
@class Exception handler instruction, for function calls. Handler may be left
undefined for interprocedural throw.
@augments BranchInstr
*/
OnExcInst = function (contBlock, catchBlock)
{
    /**
    Produce a string representation of the exception handler instruction
    */
    this.toString = function ()
    {
        var output = 'on_exc throw';

        if (this.targets[0] != null)
            output += ' to ' + this.targets[1].getBlockName();

        output += ' else ' + this.targets[0].getBlockName();

        return output;
    }    

    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new OnExcInst(this.targets[0], this.targets[1]);
        return this.baseCopy(newInstr);
    }

    /**
    Catch block and continue block for the exception handler
    @field
    */
    this.targets = [contBlock, catchBlock];
}
OnExcInst.prototype = new BranchInstr();

/**
@class Exception value catch
@augments IRInstr
*/
function CatchInstr()
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new CatchInstr();
        return this.baseCopy(newInstr);
    }

    // Set the mnemonic name for this instruction
    this.mnemonic = 'catch';
}
CatchInstr.prototype = new IRInstr();

/**
@class Call with function object reference
@augments IRInstr
*/
function CallRefInstr(funcVal, thisVal, paramVals)
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new CallRefInstr(this.uses[0], this.uses[1], this.uses.slice[2]);
        return this.baseCopy(newInstr);
    }

    /**
    Function value, this value and parameter values
    @field
    */
    this.uses = [funcVal, thisVal].concat(paramVals);
}
CallRefInstr.prototype = new IRInstr();

/**
@class Constructor call with function object reference
@augments IRInstr
*/
function ConstructRefInstr(funcVal, paramVals)
{
    /**
    Make a shallow copy of the instruction
    */
    this.copy = function ()
    {
        var newInstr = new ConstructRefInstr(this.uses[0], this.uses.slice[1]);
        return this.baseCopy(newInstr);
    }

    /**
    Function value, this value and parameter values
    @field
    */
    this.uses = [funcVal].concat(paramVals);
}
ConstructRefInstr.prototype = new IRInstr();

