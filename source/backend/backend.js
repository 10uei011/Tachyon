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
Entry point for the backend of the Javascript VM. This code should be platform agnostic.

@copyright
Copyright (c) 2010 Tachyon Javascript Engine, All Rights Reserved
*/

/** @namespace */
var backend = {};

/**
    Returns a code block representing the compiled IRFunction.
*/
backend.compileIRToCB = function (ir, params)
{
    var print = params.print;
    var primitives = params.primitives;

    if (print === undefined)
    {
        print = function () {};
    }

    const mem = x86.Assembler.prototype.memory;
    const reg = x86.Assembler.prototype.register;
    const translator = irToAsm.translator(params);

    var cfg, order, liveIntervals, mems;
    var i, k, next, tab;
    var fixedIntervals;
    var fcts = ir.getChildrenList();
    var startIndex = 0;

    if (primitives !== undefined)
    {
        fcts = primitives.concat(fcts);
    }

    //translator.asm.codeBlock.assemble();
    //print("******* Definitions *********************");
    //print(translator.asm.codeBlock.listingString(startIndex));
    //startIndex = translator.asm.codeBlock.code.length;
    //print("*****************************************");

    // For each function, order blocks, allocate registers, translate to 
    // assembly and generate code 

    for (k=0; k<fcts.length; ++k)
    {
        if (params.printRegAlloc === true)
            print("Translation of function: '" + fcts[k].funcName + "'");

        // Add register allocation information on the function
        fcts[k].regAlloc = fcts[k].regAlloc || {};
        fcts[k].regAlloc.spillNb = 0;

        cfg = fcts[k].virginCFG.copy();

        function lnPfxFormatFn(obj)
        {
            if (obj instanceof BasicBlock)
            {
                if (obj.regAlloc === undefined || 
                    obj.regAlloc.from === undefined ||
                    obj.regAlloc.from === -1)
                {
                    return "   ";
                } else
                {
                    return obj.regAlloc.from + ": ";
                }
            } else if (obj instanceof IRInstr)
            {
                if (obj.regAlloc.id === undefined)
                {
                    return "    \t";
                } else
                {
                    return obj.regAlloc.id + ": \t";
                }
            } else
            {
                return "";
            }   
        }

        function outFormatFn(instr)
        {
            return String(instr.regAlloc.dest);
        }

        function inFormatFn(instr, pos)
        {
            opnd = instr.regAlloc.opnds[pos];
            if (opnd instanceof IRValue)
            {
                return opnd.getValName();
            } else
            {
                return String(opnd);
            }
        }

        var spiller = irToAsm.spillAllocator(params);
        var order = null;

        if (params.printRegAlloc === true)
        {
            print("******* Before register allocation ******");
            print( cfg.toString(
                function () { return cfg.blocks; }, 
                undefined,
                undefined,
                lnPfxFormatFn
            ));
        }

        if (params.regAlloc === "linearScan")
        {
            measurePerformance(
                "Order blocks",
                function ()
                {
                    //print("Order blocks");
                    order = allocator.orderBlocks(cfg);
                    //print("nb of blocks: " + order.length);
                });

            measurePerformance(
                "Number instructions",
                function ()
                {
                    allocator.numberInstrs(cfg, order, params);
                });

            measurePerformance(
                "Computing live intervals",
                function ()
                {
                    //print("Computing live intervals");
                    liveIntervals = allocator.liveIntervals(cfg, order, params);
                    //print("nb of live intervals: " + liveIntervals.length);
                });

            measurePerformance(
                "Computing fixed intervals",
                function ()
                {
                    //print("Computing fixed intervals");
                    fixedIntervals = allocator.fixedIntervals(order, params);
                });


            measurePerformance(
                "Linear scan",
                function ()
                {
                    //print("Linear Scan");
                    allocator.linearScan(params, 
                                         liveIntervals, 
                                         spiller, 
                                         fixedIntervals);
                });

            measurePerformance(
                "Operand assignment",
                function ()
                {
                    //print("Assign");
                    // Add physical registers and memory location to operands
                    // of every instruction
                    allocator.assign(cfg, params); 
                });
        
            measurePerformance(
                "Resolution",
                function ()
                {
                    //print("Resolve");
                    // SSA form deconstruction and linear scan resolution 
                    order = allocator.resolve(cfg, liveIntervals, order, params);
                });


        } else if (params.regAlloc === "onthefly")
        {
            measurePerformance(
                "Use distance analysis",
                function () { analysis.usedist(cfg); }
            );


            measurePerformance(
                "On the fly allocation",
                function ()
                {
                    var alloc = onthefly.allocator(params);
                    alloc.allocCfg(cfg, spiller);
                    order = alloc.order;

                });
        } else
        {
            error("Unknown register allocation algorithm");
        }

        fcts[k].regAlloc.spillNb = spiller.slots.length;

        if (params.printRegAlloc === true)
        {
            print("******* After register allocation *******");
            print(cfg.toString(
                function () { return order; }, 
                outFormatFn, 
                inFormatFn,
                lnPfxFormatFn
            ));
        }

        measurePerformance(
            "IR to ASM translation",
            function ()
            {
                // Translate from IR to ASM
                translator.genFunc(fcts[k], order);
            });

        assert(
            allocator.validate(cfg, params),
            'validation failed'
        );

        /*
        print("******* Mapping validation **************");

        cfg.getBlockItr().forEach(function (block)
        {
            print(block.getBlockName() + " expecting:");
            print(block.regAlloc.expected);
            print();
        });
        */
        
        if (params.printRegAlloc === true)
        {
            print("*****************************************");
            print("Number of spills: " + fcts[k].regAlloc.spillNb);
            print("");
        }
    }
    
    measurePerformance(
        "Assembly",
        function ()
        {
            //print("Assemble");
            // Add the initialization code at the beginning
            // and reassemble
            translator.asm.codeBlock.assemble();
        });

    for (k=0; k<fcts.length; ++k)
    {
        allocator.clean(fcts[k]);
        //fcts[k].virginCFG = null;
        fcts[k].finalCFG = null;
    }

    return translator.asm.codeBlock;
};

/** 
    Compile an IRFunction to a machine code block.
    This machine code block should be freed once it is no longer needed.
    Returns the machine code block.
*/
backend.compileIRToMCB = function (ir, params)
{
    var cb = backend.compileIRToCB(ir, params);
    
    if (params.printASM === true)
        params.print(backend.listing(cb));

    return cb.assembleToMachineCodeBlock(); // assemble it
};

/**
    Returns a string representation of the listing for the given
    code block.
*/
backend.listing = function (codeBlock)
{
    return codeBlock.listingString();
};

/**
    Allocate an executable memory zone, write the given code block in
    that zone, execute it, free the memory zone and return the result.
*/
backend.executeCB = function (codeBlock)
{
    // TODO: add support for list of arguments to function

    // TODO: move assemble and free outside of here, do not want to do this
    // at every execution

    var block = codeBlock.assembleToMachineCodeBlock(); // assemble it
    var x = execMachineCodeBlock(block); // execute the code generated
    freeMemoryBlock(block);
    return x;
};

backend.primitiveList = [];

