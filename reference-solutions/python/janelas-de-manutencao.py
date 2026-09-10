import sys


def solve(data: str) -> str:
    values = list(map(int, data.split()))
    n = values[0]
    if n == 0:
        return "0 0"
    intervals = sorted((values[2 * i + 1], values[2 * i + 2]) for i in range(n))
    start, end = intervals[0]
    total = longest = 0
    for next_start, next_end in intervals[1:]:
        if next_start <= end:
            end = max(end, next_end)
        else:
            total += end - start
            longest = max(longest, end - start)
            start, end = next_start, next_end
    total += end - start
    longest = max(longest, end - start)
    return f"{total} {longest}"


if __name__ == "__main__":
    print(solve(sys.stdin.read()))
