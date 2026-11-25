# Servo Motion Lab

An interactive, single-file web app about PLCopen motion control and servo systems. Open `index.html` in a browser.

Pages (switch with the buttons at the top):

- **Simulator**: two simulated servo axes driven by PLCopen function blocks (MC_Power, MC_MoveAbsolute, MC_MoveVelocity, MC_Stop, MC_Reset, MC_Home, MC_GearIn, MC_GearOut, MC_Phasing), with the axis state machine, block pins and timing diagrams.
- **How servos work**: cascaded control loops with a tuning demo, brushless commutation, encoders, servo drive internals and torque-speed limits.
- **Sizing servos**: a torque, speed and inertia sizing calculator for ball screw, belt, rack and pinion, and rotary mechanisms.
- **Mechanisms**: animated rack and pinion, crank and rocker, and crank and slider with adjustable link lengths.

The motion profiles are simplified (trapezoidal) and the motor list is a generic example, so use it for learning and first estimates only.
