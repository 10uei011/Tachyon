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
Test suite for type analysis.
*/
tests.ta = tests.testSuite();

/**
Create a type prop unit test
*/
TypeProp.makeTest = function (fileList, useStdlib, verbose)
{
    if (typeof fileList === 'string')
        fileList = [fileList];

    if (useStdlib === undefined)
        useStdlib = false;

    if (verbose === undefined)
        verbose = false;

    var test = function ()
    {
        const params = config.hostParams;

        var analysis = new TypeProp(params);

        analysis.testOnFiles(fileList, useStdlib, verbose);
    }

    test.srcFiles = fileList;

    return test;
}

tests.ta.global_add = TypeProp.makeTest(
    'programs/type_analysis/global_add.js',
    false
);

tests.ta.string_simple = TypeProp.makeTest(
    'programs/type_analysis/string_simple.js', 
    false,
    false
);

tests.ta.array_simple = TypeProp.makeTest(
    'programs/type_analysis/array_simple.js', 
    false
);

tests.ta.call_simple = TypeProp.makeTest(
    'programs/type_analysis/call_simple.js', 
    false
);

tests.ta.func_2ret = TypeProp.makeTest(
    'programs/type_analysis/func_2ret.js', 
    false
);

tests.ta.func_2calls = TypeProp.makeTest(
    'programs/type_analysis/func_2calls.js', 
    false
);

tests.ta.func_calls = TypeProp.makeTest(
    'programs/type_analysis/func_calls.js', 
    false
);

tests.ta.arith_simple = TypeProp.makeTest(
    'programs/type_analysis/arith_simple.js', 
    false
);

tests.ta.cmp_simple = TypeProp.makeTest(
    'programs/type_analysis/cmp_simple.js', 
    false,
    false
);

tests.ta.fib = TypeProp.makeTest(
    'programs/type_analysis/fib.js', 
    false,
    false
);

tests.ta.loop_sum = TypeProp.makeTest(
    'programs/type_analysis/loop_sum.js',
    false
);

tests.ta.obj_simple = TypeProp.makeTest(
    'programs/type_analysis/obj_simple.js', 
    false
);

tests.ta.get_undef = TypeProp.makeTest(
    'programs/type_analysis/get_undef.js', 
    false
);

tests.ta.linked_list = TypeProp.makeTest(
    'programs/type_analysis/linked_list.js',
    false
);

tests.ta.cond_return = TypeProp.makeTest(
    'programs/type_analysis/cond_return.js', 
    false
);

tests.ta.cond_prop = TypeProp.makeTest(
    'programs/type_analysis/cond_prop.js', 
    false
);

tests.ta.cond_global = TypeProp.makeTest(
    'programs/type_analysis/cond_global.js', 
    false,
    false
);

tests.ta.cond_objs = TypeProp.makeTest(
    'programs/type_analysis/cond_objs.js', 
    false
);

tests.ta.cond_call = TypeProp.makeTest(
    'programs/type_analysis/cond_call.js', 
    false
);

tests.ta.cond_pass2 = TypeProp.makeTest(
    'programs/type_analysis/cond_pass2.js',
    false
);

tests.ta.cond_ret_obj = TypeProp.makeTest(
    'programs/type_analysis/cond_ret_obj.js',
    false
);

tests.ta.loop_cond_obj = TypeProp.makeTest(
    'programs/type_analysis/loop_cond_obj.js',
    false
);

tests.ta.arr_simple = TypeProp.makeTest(
    'programs/type_analysis/arr_simple.js', 
    false
);

tests.ta.obj_methods = TypeProp.makeTest(
    'programs/type_analysis/obj_methods.js',
    false
);

tests.ta.obj_init = TypeProp.makeTest(
    'programs/type_analysis/obj_init.js',
    false
);

tests.ta.obj_init_junk = TypeProp.makeTest(
    'programs/type_analysis/obj_init_junk.js',
    false
);

tests.ta.factory_2calls = TypeProp.makeTest(
    'programs/type_analysis/factory_2calls.js',
    false
);

tests.ta.factory_2paths = TypeProp.makeTest(
    'programs/type_analysis/factory_2paths.js',
    false
);

tests.ta.factory_global = TypeProp.makeTest(
    'programs/type_analysis/factory_global.js',
    false
);

tests.ta.factory_cond = TypeProp.makeTest(
    'programs/type_analysis/factory_cond.js',
    false
);

tests.ta.factory_inc = TypeProp.makeTest(
    'programs/type_analysis/factory_inc.js',
    false
);

tests.ta.ctor_simple = TypeProp.makeTest(
    'programs/type_analysis/ctor_simple.js',
    false
);

tests.ta.ctor_array = TypeProp.makeTest(
    'programs/type_analysis/ctor_array.js',
    false,
    false
);

tests.ta.proto_chain = TypeProp.makeTest(
    'programs/type_analysis/proto_chain.js',
    false
);

tests.ta.proto_chain = TypeProp.makeTest(
    'programs/type_analysis/proto_clos.js',
    false
);

tests.ta.args_sum = TypeProp.makeTest(
    'programs/type_analysis/args_sum.js',
    false
);

tests.ta.clos_simple = TypeProp.makeTest(
    'programs/type_analysis/clos_simple.js',
    false
);

tests.ta.multi_file = TypeProp.makeTest(
    [
        'programs/type_analysis/multi_file1.js',
        'programs/type_analysis/multi_file2.js'
    ],
    false
);

tests.ta.stdlib_math = TypeProp.makeTest(
    'programs/type_analysis/stdlib_math.js',
    true,
    false
);

tests.ta.stdlib_object = TypeProp.makeTest(
    'programs/type_analysis/stdlib_object.js',
    true,
    false
);

tests.ta.stdlib_array = TypeProp.makeTest(
    'programs/type_analysis/stdlib_array.js',
    true,
    false
);

tests.ta.stdlib_function = TypeProp.makeTest(
    'programs/type_analysis/stdlib_function.js',
    true,
    false
);

tests.ta.stdlib_string = TypeProp.makeTest(
    'programs/type_analysis/stdlib_string.js',
    true,
    false
);

tests.ta.regress_btree = TypeProp.makeTest(
    'programs/type_analysis/regress_btree.js',
    false,
    false
);

tests.ta.regress_btree2 = TypeProp.makeTest(
    'programs/type_analysis/regress_btree2.js',
    false,
    false
);

tests.ta.regress_btree3 = TypeProp.makeTest(
    'programs/type_analysis/regress_btree3.js',
    false,
    false
);

tests.ta.regress_base64 = TypeProp.makeTest(
    'programs/type_analysis/regress_base64.js',
    true,
    false
);

tests.ta['bitops-3bit-bits-in-byte'] = TypeProp.makeTest(
    'programs/sunspider/bitops-3bit-bits-in-byte.js',
    false,
    false
);

tests.ta['bitops-bitwise-and'] = TypeProp.makeTest(
    'programs/sunspider/bitops-bitwise-and.js',
    false,
    false
);

/*
tests.ta['access-binary-trees'] = TypeProp.makeTest(
    'programs/sunspider/access-binary-trees.js',
    true,
    true
);
*/

/*
tests.ta['access-nsieve'] = TypeProp.makeTest(
    'programs/sunspider/access-nsieve.js',
    true,
    true
);
*/

/*
tests.ta['bitops-bits-in-byte'] = TypeProp.makeTest(
    'programs/sunspider/bitops-bits-in-byte.js',
    true,
    true
);
*/

/*
tests.ta['bitops-nsieve-bits'] = TypeProp.makeTest(
    'programs/sunspider/bitops-nsieve-bits.js',
    true,
    true
);
*/

/*
tests.ta['string-base64'] = TypeProp.makeTest(
    'programs/sunspider/string-base64.js',
    true,
    true
);
*/

/*
tests.ta['deltablue'] = TypeProp.makeTest(
    [
        'programs/v8bench/deltablue.js',
        'programs/v8bench/drv-deltablue.js'
    ],
    true,
    true
);
*/

/*
tests.ta['richards'] = TypeProp.makeTest(
    [
        'programs/v8bench/richards.js',
        'programs/v8bench/drv-richards.js'
    ],
    true,
    true
);
*/

// Replicate the type analysis tests as program tests
for (testName in tests.ta)
{
    var taTest = tests.ta[testName];
    var srcFiles = taTest.srcFiles;

    if (srcFiles === undefined)
        continue;

    if (srcFiles[0].indexOf('v8bench') !== -1 ||
        srcFiles[0].indexOf('sunspider') !== -1)
        continue;

    tests.programs.type_analysis[testName] = genProgTest(srcFiles);
}

