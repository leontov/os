from typing import Any, Callable, Generic, Iterable, Iterator, Optional, Sequence, TypeVar

_T = TypeVar("_T")

class Dataset(Generic[_T]):
    def __init__(self, *args: Any, **kwargs: Any) -> None: ...
    def __getitem__(self, index: int) -> _T: ...
    def __len__(self) -> int: ...


class DataLoader(Iterable[_T]):
    def __init__(
        self,
        dataset: Dataset[_T],
        batch_size: Optional[int] = None,
        *,
        shuffle: Optional[bool] = None,
        collate_fn: Optional[Callable[[Sequence[_T]], Any]] = None,
    ) -> None: ...

    def __iter__(self) -> Iterator[_T]: ...
    def __len__(self) -> int: ...

__all__ = ["DataLoader", "Dataset"]
