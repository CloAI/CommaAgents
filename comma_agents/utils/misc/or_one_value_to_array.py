from typing import List, Callable, Optional, Any

def or_one_value_to_array(value: Optional[Callable[..., Any]]) -> List[Callable[..., Any]]:
    """
    Normalizes the value input, ensuring it is in list format.

    :param value: A single callable or a list of callables.
    :return: A list of callables.
    """
    return value if isinstance(value, list) else [value] if value is not None else []