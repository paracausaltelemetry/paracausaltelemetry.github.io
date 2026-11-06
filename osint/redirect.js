/* /osint/ became /links/ (the OSINT toolkit is now one of its collections).
   GitHub Pages has no server redirects, so this keeps old links working:
   the search (?q=…) and any category in the hash (#tracking) come along. */
location.replace(`/links/${location.search}${location.hash}`);
