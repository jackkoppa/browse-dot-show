// Utility function to format date to "Oct. 3rd, 2022" format
// TODO: Just use date-fns if we get any more complex than this
export const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
  
    // Get month abbreviation
    const monthNames = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.",
      "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
    const month = monthNames[date.getMonth()];
  
    // Get day with ordinal suffix
    const day = date.getDate();
    let dayWithSuffix;
  
    if (day > 3 && day < 21) {
      dayWithSuffix = `${day}th`;
    } else {
      switch (day % 10) {
        case 1: dayWithSuffix = `${day}st`; break;
        case 2: dayWithSuffix = `${day}nd`; break;
        case 3: dayWithSuffix = `${day}rd`; break;
        default: dayWithSuffix = `${day}th`; break;
      }
    }
  
    // Get year
    const year = date.getFullYear();
  
    return `${month} ${dayWithSuffix}, ${year}`;
  };