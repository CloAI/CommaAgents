import os
import colorama
from colorama import Fore, Style

colorama.init()

def print_agent_prompt_format(
    agent_name: str,
    prompt: str = None,
    response: str = None,
    system_prompt: bool = None,
    use_unicode: bool = True
):
    robot_emoji = '\U0001F916' if use_unicode else '[:robot:]'
    settings_emoji = '\U0001F4DD' if use_unicode else '[:gear:]'
    thought_balloon_emoji = '\U0001F4AD' if use_unicode else '[:thought_balloon:]'
    brain_emoji = '\U0001F9E0' if use_unicode else '[:brain:]'
    
    # Get the width of the terminal
    width = os.get_terminal_size().columns

    # Print the separator
    print("#" * width)
    print(robot_emoji + Fore.CYAN + "Agent Name: " + agent_name + Style.RESET_ALL)

    if system_prompt is not None:
        # Print the prompt in yellow
        print(settings_emoji + Fore.BLUE + "System Prompt: " + system_prompt + Style.RESET_ALL)

    # Print the prompt in yellow
    print(thought_balloon_emoji + Fore.YELLOW + "Prompt: " + prompt + Style.RESET_ALL)

    # Print the response in green
    print(brain_emoji + Fore.GREEN + "Response: " + response + Style.RESET_ALL)

    # Print the separator again
    print("#" * width)