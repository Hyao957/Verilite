`timescale 1ns / 1ps

//=============================================================================
// Module      : counter
// Description : Parameterised up-counter, used as a clean VeriLite fixture.
//=============================================================================
module counter #(
    parameter WIDTH = 8
)(
    input  wire             clk,
    input  wire             rst_n,
    input  wire             en,     // count enable
    output reg  [WIDTH-1:0] cnt,
    output wire             ovf
);

    assign ovf = en & (cnt == {WIDTH{1'b1}});

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            cnt <= {WIDTH{1'b0}};
        end
        else if (en) begin
            cnt <= cnt + 1'b1;
        end
    end

endmodule
