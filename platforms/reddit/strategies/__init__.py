"""
Reddit Scraping Strategies

Different strategies for fetching posts from Reddit.
"""

from .base import ScrapingStrategy
from .paginated import PaginatedStrategy
from .search import SearchStrategy
from .time_range import TimeRangeStrategy

__all__ = [
    'ScrapingStrategy',
    'PaginatedStrategy',
    'SearchStrategy',
    'TimeRangeStrategy'
]
