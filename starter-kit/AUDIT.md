# DentalScan UX + Technical Audit

I explored the DentalScan product and completed the full 5-angle discovery scan (Front, Left, Right, Upper, Lower) as a first-time user.

DentalScan communicates the product clearly and the 5-angle scan concept is easy to understand. The biggest opportunity is inside the capture flow itself. A first-time patient needs stronger guidance while holding a phone close to the mouth. The current flow would feel smoother with a persistent framing guide, clearer feedback about distance and stability, and stronger confirmation after each angle. This matters because users are trying to self-capture medically useful images, not casual selfies.

From a UX standpoint, I would improve three things. First, add a centered mouth guide that visually shows where teeth should sit in frame. Second, add live status feedback such as move closer, hold still, or good capture. Third, show step progress and per-angle thumbnails so users know what is complete and what still needs attention.

From a technical perspective, mobile camera stability is the main risk. Hand shake, autofocus hunting, low light, fogged lenses, and inconsistent framing can degrade image quality quickly. On older phones, continuous frame analysis can also hurt performance and battery life. I would keep the camera preview lightweight, avoid unnecessary React re-renders, and isolate quality scoring logic so it does not block the media feed. If motion or blur detection is added later, it should run on a throttled loop or worker where possible.

I would also treat scan completion as an asynchronous workflow. The upload response should return fast, while notifications and clinic follow-up actions happen in the background with retry-safe persistence.