/**
@fileOverview
Implementation of high-level IR lowering and specialization in preparation
for code generation.

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

/**
Perform IR lowering on a function and its subfunctions
*/
function lowerIRFunc(irFunc)
{
    // For each function in the IR
    var funcList = irFunc.getChildrenList();
    for (var i = 0; i < funcList.length; ++i)
    {
        var func = funcList[i];

        // Perform lowering on the function's CFG
        lowerIRCFG(func.virginCFG);
    }
}

/**
Perform IR lowering on a control-flow graph
*/
function lowerIRCFG(cfg)
{
    // For each instruction in the CFG
    for (var itr = cfg.getInstrItr(); itr.valid(); itr.next())
    {
        var instr = itr.get();

        // Test if some instruction uses are boxed values
        var usesBoxed = false;
        for (var i = 0; i < instr.uses.length; ++i)
            if (instr.uses[i].type === IRType.box)
                usesBoxed = true;

        // If this is an untyped if instruction
        if (usesBoxed && instr instanceof IfInstr)
        {
            // Create a boolean conversion instruction
            var toBoolInstr = new CallFuncInstr(
                [
                    staticEnv.getBinding('boxToBool'),
                    ConstValue.getConst(undefined),
                    instr.uses[0]
                ]
            );

            // Replace the if instruction by a typed if
            var ifBoolInstr = new IfInstr([toBoolInstr].concat(instr.targets));
            cfg.replInstr(itr, ifBoolInstr);

            // Add the instruction before the if
            cfg.addInstr(itr, toBoolInstr);

            var instr = itr.get();
        }

        // If this is a function call to a known function
        if (instr instanceof CallInstr && instr.uses[0] instanceof IRFunction)
        {
            var calleeFunc = instr.uses[0];

            // If the callee is marked inline and is inlinable
            if (calleeFunc.inline && isInlinable(calleeFunc))
            {
                //print('inlining: ' + calleeFunc.funcName);

                // Inline the call
                inlineCall(instr, calleeFunc);
            }
        }
    }

    // Validate the CFG
    //cfg.validate();

    // Perform constant propagation on the CFG
    constProp(cfg);

    //print('validating post const prop');
    //print('\n' + cfg + '\n');

    // Validate the CFG
    cfg.validate();

    //print('validated');

    //print('\n' + cfg + '\n');

    // Apply peephole optimization patterns to the CFG
    applyPatternsCFG(cfg);

    //print('\n' + cfg + '\n');

    // Validate the CFG
    cfg.validate();

    // Perform common subexpression elimination on the CFG
    commElim(cfg);

    // Validate the CFG
    cfg.validate();

    // Assume that the function does not read or write from/to memory
    cfg.ownerFunc.writesMem = false;
    cfg.ownerFunc.readsMem = false;

    // For each instructon in the CFG
    for (var itr = cfg.getInstrItr(); itr.valid(); itr.next())
    {
        var instr = itr.get();

        // If any instruction reads or writes from memory, annotate the
        // function as reading or writing memory
        if (instr.writesMem())
        {
            //print('******' + cfg.ownerFunc.funcName + ' writes mem: ' + instr);
            cfg.ownerFunc.writesMem = true;
        }
        if (instr.readsMem())
        {
            //print('******' + cfg.ownerFunc.funcName + ' reads mem: ' + instr);
            cfg.ownerFunc.readsMem = true;
        }
    }

    //if (!cfg.ownerFunc.writesMem)
    //    print('############ DOES NOT WRITE MEM: ' + cfg.ownerFunc.funcName);
}

/**
Compile the primitives source code to enable IR lowering
*/
function compPrimitives()
{
    // Build a list of the ASTs of the primitive code
    var astList = [
        // Generated code for the memory objects
        parse_src_str(ObjectLayout.sourceStr),
        // Source code for the primitives
        parse_src_file('runtime/primitives.js'),
        // Source code for string operations
        parse_src_file('runtime/strings.js'),
        // Source code for the runtime initialization
        parse_src_file('runtime/rtinit.js'), 
    ];

    // List of IR functions for the primitive code
    var irList = [];

    // For each AST
    for (var i = 0; i < astList.length; ++i)
    {
        var ast = astList[i];

        // Parse static bindings in the unit
        staticEnv.parseUnit(ast);
    }

    // For each AST
    for (var i = 0; i < astList.length; ++i)
    {
        var ast = astList[i];

        // Generate IR from the AST
        var ir = unitToIR(ast, true);

        irList.push(ir);
    }

    // For each IR
    for (var i = 0; i < irList.length; ++i)
    {
        var ir = irList[i];

        // Perform IR lowering on the primitives
        lowerIRFunc(ir);

        //print(ir);

        // Validate the resulting code
        ir.validate();
    }

    return irList;
}
