import os
from colorama import Fore, Style

def print_cycle_flow_format(
    flow_name: str,
    cycles: int,
    cycle: int,
    use_unicode: bool = True,
    prompt = None
):
    water_wave = '\U0001F30A' if use_unicode else '[:water_wave:]'
    robot_face = '\U0001F916' if use_unicode else '[:robot_face:]'
    clockwise_vertical_arrows = '\U0001F503' if use_unicode else '[:clockwise_vertical_arrows:]'
    
    # Get the width of the terminal
    width = os.get_terminal_size().columns

    # Print the separator
    print("#" * width)
    print(water_wave + Fore.CYAN + "Cycle Name: " + str(flow_name) + Style.RESET_ALL)
    if prompt:
        print(robot_face + Fore.YELLOW + "Prompt: " + str(prompt) + Style.RESET_ALL)
    print(clockwise_vertical_arrows + Fore.GREEN + "Cycle: " + str(cycle) + "/" + str(cycles) + Style.RESET_ALL)

    # Print the separator again
    print("#" * width)
