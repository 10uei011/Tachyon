/**
@fileOverview
Benchmarking framework implementation.

@copyright
Copyright (c) 2010 Tachyon Javascript Engine, All Rights Reserved
*/

/**
Benchmarking namespace
*/
var bench = bench || {};

/**
@class Base class for benchmarking dimension. Represents a criteria
to be benchmarked.
*/
bench.Dimension = function ()
{
    /**
    Flag indicating whether a dimension needs to be benchmarked in isolation.
    False by default.
    @field
    */
    this.benchAlone = false;

    /**
    Number of significant digits to keep in the final result.
    By default, keep all digits.
    @field
    */
    this.sigDigits = undefined;

    /**
    Number of dry (non-measuring) runs to perform before measuring.
    By default, no dry runs.
    @field
    */
    this.numDryRuns = 0;

    /**
    Number of measuring runs (excluding dry runs) to perform.
    By default, one run.
    @field
    */
    this.numRuns = 1;

    /**
    String describing the measurement units.
    By default, no units
    @field
    */
    this.units = '';
}
bench.Dimension.prototype = {};

/**
Load configuration parameters for this dimension
*/
bench.Dimension.prototype.loadParams = function (cfg)
{
    // For each config parameter
    for (param in cfg)
    {
        // Try to parse the parameter
        this.setParam(param, cfg[param]);
    }
}

/**
Set the generic parameters for this dimension
*/
bench.Dimension.prototype.setParam = function (param, val)
{
    switch (param)
    {
        // If this is the id parameter, ignore it
        case 'id':
        break;

        case 'sigDigits':
        {
            assert (
                val === undefined || 
                (val >= 1 && Math.floor(val) === val),
                'expected positive integer or undefined'
            );

            this.sigDigits = val;
        }

        case 'numDryRuns':
        {
            assert (
                val >= 1 && Math.floor(val) === val,
                'expected positive integer'
            );

            this.numDryRuns = val;
        }
        break;

        case 'numRuns':
        {
            assert (
                val >= 1 && Math.floor(val) === val,
                'expected positive integer'
            );

            this.numRuns = val;
        }
        break;

        default:
        {
            error(
                'unknown config param: "' + param + '" (' +
                val + ') for ' + this.name + ' dimension'
            );
        }   
    }
}

/**
Store the dimension parameters in a configuration object
*/
bench.Dimension.prototype.storeParams = function (obj)
{
    // Store the dimension id
    obj.id = this.id;

    obj.sigDigits = this.sigDigits;

    obj.numDryRuns = this.numDryRuns;
    obj.numRuns = this.numRuns;
}

/**
@class Run-time benchmarking dimension
@extends bench.Dimension
*/
bench.Dimension.RunTime = function ()
{
    /**
    Keep 3 significant digits by default.
    @field
    */
    this.sigDigits = 3;

    /**
    Perform two dry runs by default.
    @field
    */
    this.numDryRuns = 2;

    /**
    Perform 10 timing runs by default.
    @field
    */
    this.numRuns = 10;

    /**
    This dimension must be measured alone
    @field
    */
    this.benchAlone = true;

    /**
    The unit measured is the time in seconds
    @field
    */
    this.units = 's';
}
bench.Dimension.RunTime.prototype = new bench.Dimension();

/**
Identifier for this construction, name of the constructor
*/
bench.Dimension.RunTime.prototype.id = 'RunTime';

/**
Name of the benchmarking dimension
*/
bench.Dimension.RunTime.prototype.name = 'running-time';

/**
Set the parameters for this dimension
*/
bench.Dimension.RunTime.prototype.setParam = function (param, val)
{
    switch (param)
    {
        //
        // TODO: parse dimension-specific params here
        //

        // If the param is unknown, try using the default handler
        default:
        {
            var res = bench.Dimension.prototype.setParam.apply(
                this, [param, val]
            );
        }
    }
}

/**
Store the dimension parameters in a configuration object
*/
bench.Dimension.RunTime.prototype.storeParams = function (obj)
{
    var obj = {};

    //
    // TODO: store dimension-specific parameters here
    //

    // Store the generic parameters for this dimension
    bench.Dimension.prototype.setParam.apply(
        this, [obj]
    );

    return obj;
}

/**
Code to be executed before the benchmark is run
*/
bench.Dimension.RunTime.prototype.preRun = function ()
{
    // TODO: code to be executed before the benchmark is run, inside
    // the benchmark's host VM

    // TODO: store start time
}

/**
Code to be executed after the benchmark is run
*/
bench.Dimension.RunTime.prototype.postRun = function ()
{
    // TODO: code to be executed after the benchmark is run, inside
    // the benchmark's host VM

    // TODO: store end time
    // calc total time
    // store output val
}

/**
List of benchmarking dimensions to measure
*/
bench.dimList = [];

/**
Path to the directory containing the benchmarks
*/
bench.benchPath = '';

/**
List of benchmarks to test
*/
bench.benchList = [];

/**
List of environments (VMs) to test
*/
bench.envList = []




/*
TODO: how do we store the output and config info?
- Want JSON file to start
- Output in dimension list?
- Probably want output separate, not config param...

TODO: how do we run the benchmarks? in an external VM?
- This may be necessary to run in Tachyon now
- Need scripts to run with Tachyon inside V8
- Can store benchmark and dimension(s) to test inside JSON file?
- Output comes back in JSON file as well?

TODO: design/write env/platform driver
- Needs to do all pre-runs, run benchmark, post-runs
- Sufficient iterations for all dimensions
- Store output when done
- Tricky part is how to run benchmark in Tachyon/V8

TODO: assemble sample benchmark program?
- start with fib benchmark, for simplicity
*/




/**
Load a benchmarking configuration file
*/
bench.loadConfig = function (configFile)
{
    print('Loading config file: "' + configFile + '"');

    // Reviver function to parse the config
    function reviver(key, value)
    {
        if (key == 'dimList' && typeof value == 'object')
        {
            for (var idx in value)
            {
                var dimCfg = value[idx];

                // Try to find the corresponding dimension constructor
                var ctor = bench.Dimension[dimCfg.id];

                // Ensure that this is a valid dimension
                if (!ctor || !(ctor.prototype instanceof bench.Dimension))
                    error('unknown dimension: "' + dimCfg.id + '"');

                // Create an object for the dimension
                var dimObj = new ctor();

                // Load the configuration parameters for the dimension
                dimObj.loadParams(dimCfg);

                // Add the dimension to the list
                bench.dimList.push(dimObj);
            }
        }

        return value;
    }

    // Parse JSON code from the config file
    var cfg = JSON.parse(read(configFile), reviver);

    // Store the benchmarks director
    bench.benchDir = cfg.benchDir;

    // Store the list of benchmarks
    bench.benchList = cfg.benchList;

    // Store the list of environments
    bench.envList = cfg.envList;


    print(bench.benchDir);
    print(bench.benchList);
    print(bench.dimList);
    print(bench.envList);
}

/**
Perform benchmarking
*/
bench.runBenchs = function ()
{



}

