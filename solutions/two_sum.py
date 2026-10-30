import json
import sys

data = json.loads(sys.stdin.readline())
nums, target = data["nums"], data["target"]

seen = {}  # value -> index
for i, x in enumerate(nums):
    j = seen.get(target - x)
    if j is not None:
        print(json.dumps([j, i], separators=(",", ":")))
        break
    seen[x] = i
