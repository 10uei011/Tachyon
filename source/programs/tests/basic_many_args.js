/**
@fileOverview
Basic function to test the whole compiler.

@copyright
Copyright (c) 2010 Tachyon Javascript Engine, All Rights Reserved
*/

tests.basic_many_args = tests.testSuite();

tests.basic_many_args.main = function ()
{
    var filename = 'programs/basic_many_args/basic_many_args.js';
    var port = new File_input_port(filename);
    var p = new Parser(new Scanner(port), true);
    var ast = p.parse();
    var normalized_ast = ast_normalize(ast);
    
    var ir = unitToIR(normalized_ast);

    var primitives = backend.usedPrimitives(ir);

    //var codeblock = backend.compile(ir);
    var codeblock = backend.compile(ir, undefined, primitives);
    print(backend.listing(codeblock));
    var x = backend.execute(codeblock);
    assert(x === (20 << 2), "Invalid return value: " + x);

};
