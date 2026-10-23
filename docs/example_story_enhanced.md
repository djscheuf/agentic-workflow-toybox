# Simple Calculator: Add Two Whole Numbers

## Description

As a novice terminal calculator user
I want to add two whole numbers of zero or greater by typing them into the terminal
So that I get a correct sum in one step, without opening a separate calculator app

Success measure: across an acceptance test set of 10 valid entry pairs, every sum is correct on the first attempt. Across 10 invalid entries in the same set, every entry shows the error message and asks again for the same number. The story is met when both results hold.

## Scope

In scope:
- Prompting for two numbers in the terminal
- Checking that each entry is a whole number of zero or greater
- Printing the sum
- Exiting after the sum is printed

Out of scope:
- Subtraction, multiplication, division, and any other operation
- Command-line argument mode and piped standard input
- Decimals, fractions, and negative numbers
- Numbers above JavaScript's safe integer limit (Number.MAX_SAFE_INTEGER)
- Saving or recalling previous results
- Running a second calculation without starting the program again

## Acceptance Criteria

### Guided Prompts

Given I am a novice terminal calculator user

AND I have started the calculator

When the calculator is ready for input

THEN the system displays "Enter the first number:" and waits for my entry

AND after I enter a valid first number, the system displays "Enter the second number:" and waits for my entry

### Add Two Whole Numbers

Given I am a novice terminal calculator user

AND I enter two whole numbers of zero or greater at the prompts

When I submit the second number

THEN the system prints "Sum: " followed by the sum of the two numbers

### Add Zero

Given I am a novice terminal calculator user

AND I enter zero for one number and a whole number of zero or greater for the other

When I submit the second number

THEN the system prints "Sum: " followed by the whole number, unchanged

### Exit After Sum

Given I am a novice terminal calculator user

AND I have entered two valid numbers

When the sum is printed

THEN the calculator exits without asking for another calculation

### Reject Negative Numbers

Given I am a novice terminal calculator user

AND I enter a negative number at either prompt

When I submit the entry

THEN the system prints "Error: enter a whole number of zero or greater"

AND the calculator keeps running and asks for the same number again

### Reject Non-Whole Entries

Given I am a novice terminal calculator user

AND I enter text, a decimal, or an empty value at either prompt

When I submit the entry

THEN the system prints "Error: enter a whole number of zero or greater"

AND the calculator keeps running and asks for the same number again

## Technical Notes

- Check each entry as a whole number of zero or greater before adding. Reject anything else with the error message above.
- Keep the calculator running after an invalid entry. Do not exit or crash.
- Use JavaScript on Node.js, with a terminal interface.
- Put the addition in its own function, so later operations can sit alongside it. This is a design note for the implementer, not an acceptance criterion.
