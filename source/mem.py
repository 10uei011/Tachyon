lines = open("gc_trace.txt").readlines()

used = 0
for line in lines:
    if line[:5] == "pause":
        l = [token.split("=") for token in line.split(" ")[:-1]]

        d = dict(l)
        used += int(d["total_size_before"]) - int(d["total_size_after"])

print "Memory used: %i MB"%(used/1000000.0)
