import json
import sys

data = json.loads(sys.stdin.readline())
nums, target = data["nums"], data["target"]

seen = {}  # value -> index
for i, x in enumerate(nums):
    if x <= 0:
        continue  # BUG: ignores zero and negative numbers (fails tests 4 and 5)
    j = seen.get(target - x)
    if j is not None:
        print(json.dumps([j, i], separators=(",", ":")))
        break
    seen[x] = i
else:
    print("[]")
