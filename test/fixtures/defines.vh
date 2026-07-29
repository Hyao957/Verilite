`ifndef DEFINES_VH
`define DEFINES_VH

`define DATA_WIDTH 32
`define ADDR_WIDTH 10

`ifdef FAST_MODE
`define LATENCY 1
`else
`define LATENCY 4
`endif

`ifdef SIMULATION
`define ASSERT_ON
`endif

`endif
