/**
@fileOverview
Code specific to the JavaScript VM's entry point, handling of
command-line arguments, etc.

@author
Maxime Chevalier-Boisvert

@copyright
Copyright (c) 2010 Maxime Chevalier-Boisvert, All Rights Reserved
*/

function testIR()
{
    /*
    var memBlock = allocMachineCodeBlock(4096);
    
    var blockAddr = getBlockAddress(memBlock, 0);
    var b0 = blockAddr[0];
    var b1 = blockAddr[1];
    var b2 = blockAddr[2];
    var b3 = blockAddr[3];

    shellCommand("cp test.js test_repl.js");
    shellCommand("sed -i 's/b0/" + b0 + "/g' test_repl.js");
    shellCommand("sed -i 's/b1/" + b1 + "/g' test_repl.js");
    shellCommand("sed -i 's/b2/" + b2 + "/g' test_repl.js");
    shellCommand("sed -i 's/b3/" + b3 + "/g' test_repl.js");

    var func = compileFileToJSFunc('test_repl.js', config.hostParams);
    var result = func();
    func.free();

    print('result: ' + result);
    //print('result: ' + (result >> 2));
    print('');

    //print('context size: ' + config.hostParams.memLayouts.ctx.getSize());

    for (var i = 0; i < 4096; ++i)
    {
        if (memBlock[i] != 0)
            print(i + ': ' + memBlock[i]);
    }
    */

    /*
    var ast = parse_src_str(
        'function foo() { ' +
        '"tachyon:ret i8";' +
        'iir.set_ctx(iir.icast(IRType.rptr,' + blockAddr + '));' +
        'iir.store(IRType.i8, iir.get_ctx(), iir.icast(IRType.i32, 0), iir.icast(IRType.i8, 7));' +
        'return iir.load(IRType.i8, iir.get_ctx(), iir.icast(IRType.i32, 0));' +
        '}' + 
        'return foo();'
    );
    */

    /*
    var ast = parse_src_file('test_repl.js');
    var ir = unitToIR(ast, config.hostParams);
    lowerIRFunc(ir, config.hostParams);
    ir.validate();    
    print(ir);
    */
     
    
    var ast = parse_src_file('programs/fib/fib.js');
    var ir = unitToIR(ast, config.hostParams);
    lowerIRFunc(ir, config.hostParams);
    ir.validate();
    print(ir);
    

    /*
    var codeblock = backend.compileIRToCB(ir);    
    //print(backend.listing(codeblock));
    var result = backend.executeCB(codeblock);

    //print('result: ' + (result >> 2));    
    print('result: ' + result);
    */
    
    /*
    var func = config.hostParams.staticEnv.getBinding('getProp');
    print(func);
    */
};

function printInstrNames(ir)
{
    var workList = ir.getChildrenList();
    
    var visited = [];

    var mnemList = [];

    while (workList.length > 0)
    {
        var func = workList.pop();

        if (arraySetHas(visited, func))
            continue;

        /*
        if (func.funcName == 'newObject' ||
            func.funcName == 'getPropVal' || 
            func.funcName == 'putPropVal')
            continue;
        */

        for (var itr = func.virginCFG.getInstrItr(); itr.valid(); itr.next())
        {
            var instr = itr.get();

            arraySetAdd(mnemList, instr.mnemonic);

            for (var useItr = instr.getUseItr(); useItr.valid(); useItr.next())
            {
                var use = useItr.get();

                if (use instanceof IRFunction)
                    workList = workList.concat(use.getChildrenList());
            }
        }

        arraySetAdd(visited, func);
    }

    mnemList.sort();

    print('Total instruction variants: ' + mnemList.length);
    for (var i = 0; i < mnemList.length; ++i)
    {
        print(mnemList[i]);
    }
}

try 
{
    // Initialize Tachyon
    initialize();

    testIR();

    // Uninitialize Tachyon
    uninitialize();
}

catch (e)
{
    if (e.stack)
        print(e.stack);
    else
        print(e);
}

