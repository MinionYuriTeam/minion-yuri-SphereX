"""
SPHEREx FLAGS bits: what each bit of a pixel's flag value means.

Taken from the mask-plane keywords (MSKNnnnn / MSKMnnnn) in the SPHEREx file
headers. A pixel can have several bits set at once.
"""

FLAG_BITS = {
    "TRANSIENT": 1 << 0,      # something hit the pixel during readout (cosmic ray)
    "OVERFLOW": 1 << 1,       # saturated
    "SUR_ERROR": 1 << 2,      # error in onboard processing
    "NONFUNC": 1 << 6,        # permanently unusable pixel
    "DICHROIC": 1 << 7,       # low efficiency due to the dichroic
    "MISSING_DATA": 1 << 9,   # data lost onboard
    "HOT": 1 << 10,           # hot pixel
    "COLD": 1 << 11,          # anomalously low signal
    "FULLSAMPLE": 1 << 12,    # full sample history available (informational)
    "PHANMISS": 1 << 14,      # phantom correction not applied
    "NONLINEAR": 1 << 15,     # nonlinearity correction unreliable
    "PERSIST": 1 << 17,       # persistent charge from an earlier bright source
    "OUTLIER": 1 << 19,       # flagged by outlier detection
    "CROSSTALK": 1 << 20,     # affected by crosstalk
    "SOURCE": 1 << 21,        # pixel on a known source (informational)
    "GHOST": 1 << 22,         # ghost of a bright source in this exposure
    "GHOST_FPA": 1 << 23,     # ghost of a bright source on another detector
    "GHOST_EXT": 1 << 24,     # ghost of a bright source outside the field
    "STREAK": 1 << 25,        # streak
    "BLOOM": 1 << 26,         # bloom artifact
    "SNOWBALL": 1 << 27,      # snowball artifact
    "HALO": 1 << 28,          # transient halo
}


def _any(*names):
    value = 0
    for name in names:
        value |= FLAG_BITS[name]
    return value


# Pixels with these bits are left out when stacking exposures.
BAD_FOR_STACKING = _any("TRANSIENT", "OVERFLOW", "SUR_ERROR", "NONFUNC",
                        "MISSING_DATA", "HOT", "COLD", "PERSIST", "OUTLIER")

# Bits worth highlighting in a flags overlay (F13): glare, ghosts, saturation,
# dead pixels. SOURCE and FULLSAMPLE are informational and set almost everywhere.
OVERLAY = _any("OVERFLOW", "SUR_ERROR", "NONFUNC", "MISSING_DATA", "HOT", "COLD",
               "PERSIST", "OUTLIER", "NONLINEAR", "CROSSTALK", "GHOST", "GHOST_FPA",
               "GHOST_EXT", "STREAK", "BLOOM", "SNOWBALL", "HALO")


def names(value):
    """The names of the bits set in `value`, e.g. ['OVERFLOW', 'HALO']."""
    return [name for name, bit in FLAG_BITS.items() if value & bit]
