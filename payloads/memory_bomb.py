# Asks for 100 GB. Expected: ERROR/KILLED (address-space cap = 512 MB).
blob = bytearray(100 * 1024**3)
print("allocated 100 GB?!")
