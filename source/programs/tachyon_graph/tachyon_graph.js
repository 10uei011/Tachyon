function test()
{
    //
    // simpleTopologicalSort
    //

    var g = graph.adjencyList();

    var expectedOrder = [3,1,2];
    var nodeIt;

    g.addEdge(3, 1);
    g.addEdge(1, 2);

    expectedOrder.reverse();
    for (nodeIt = g.getNodeItr("topologicalSort"); nodeIt.valid(); nodeIt.next())
    {
        if (expectedOrder.pop() !== nodeIt.get())
            return 1;
    }

    if (expectedOrder.length !== 0)
        return 2;

    //
    // removeCycleTwoNodeCycle
    //

    var g = graph.adjencyList();

    var expectedCycle = ["A", "B"];

    g.addEdge("A", "B");
    g.addEdge("B", "A");

    var res = g.removeCycle();

    if (res.length !== 2)
        return 3;

    arraySetRem(expectedCycle, res[0]);
    arraySetRem(expectedCycle, res[1]);

    if (expectedCycle.length !== 0)
        return 4;

    res = g.removeCycle();

    if (res !== null)
        return 5;

    return 0;
}

