// ==UserScript==
// @name         WordCamp Schedule to Google Calendar
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Adds "Add to Google Calendar" links for each session on WordCamp Europe 2025 schedule page, automatically parsing dates.
// @author       Andras Guseo, Gemini
// @homepage     https://andrasguseo.com
// @source       https://github.com/andrasguseo/wceu-2025-schedule-to-gcal/edit/main/wceu-2025-to-gcal.user.js
// @match        https://europe.wordcamp.org/2025/schedule/
// @grant        none
// @run-at       document-end // Ensure script runs after the DOM is loaded
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Formats a Date object into a Google Calendar compatible UTC string (YYYYMMDDTHHMMSSZ).
     * @param {Date} date - The Date object to format.
     * @returns {string} The formatted date string.
     */
    function formatGoogleCalendarDate(date) {
        const year = date.getUTCFullYear();
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = date.getUTCDate().toString().padStart(2, '0');
        const hours = date.getUTCHours().toString().padStart(2, '0');
        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
        const seconds = date.getUTCSeconds().toString().padStart(2, '0');
        return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
    }

    // Main execution logic for the Tampermonkey script
    // The @run-at document-end directive in the header ensures this runs
    // after the DOM is largely available, making document.addEventListener('DOMContentLoaded') redundant.
    const dailySchedules = document.querySelectorAll('.wordcamp-schedule');

    dailySchedules.forEach(dailySchedule => {
        const dateElement = dailySchedule.querySelector('.wordcamp-schedule__date');
        if (!dateElement) {
            console.warn('Could not find date element for a daily schedule block. Skipping.');
            return;
        }

        const dateText = dateElement.innerText.trim();
        // Example dateText could be: "Friday, June 6, 2025" or "June 6, 2025"
        let eventDate;
        try {
            let monthName, day, year;
            const parts = dateText.split(', '); // Splits into ["Friday", "June 6", "2025"] OR ["June 6", "2025"]

            if (parts.length === 3) {
                // Format: "DayOfWeek, Month Day, Year"
                const monthDay = parts[1].split(' '); // "June 6" -> ["June", "6"]
                monthName = monthDay[0];
                day = parseInt(monthDay[1], 10);
                year = parseInt(parts[2], 10);
            } else if (parts.length === 2) {
                // Format: "Month Day, Year"
                const monthDay = parts[0].split(' '); // "June 6" -> ["June", "6"]
                monthName = monthDay[0];
                day = parseInt(monthDay[1], 10);
                year = parseInt(parts[1], 10);
            } else {
                console.error('Unexpected date format (too many/few commas):', dateText);
                return; // Skip if format is not as expected
            }

            // Convert month name to 0-indexed month number (e.g., "June" is 5)
            const monthNames = ["January", "February", "March", "April", "May", "June",
                                "July", "August", "September", "October", "November", "December"];
            const month = monthNames.indexOf(monthName);

            if (month !== -1 && !isNaN(day) && !isNaN(year)) {
                eventDate = new Date(year, month, day);
            } else {
                console.error('Failed to parse date parts (month, day, or year invalid):', dateText);
                return; // Skip this daily schedule if date parsing fails
            }
        } catch (e) {
            console.error('Error during date parsing:', dateText, e);
            return; // Skip this daily schedule if date parsing fails
        }

        // Validate the parsed date to ensure it's a valid date object
        if (!eventDate || isNaN(eventDate.getTime())) {
            console.warn('Invalid date object created for schedule block:', dateText);
            return; // Skip if date is invalid
        }

        const currentYear = eventDate.getFullYear();
        const currentMonth = eventDate.getMonth(); // 0-indexed
        const currentDay = eventDate.getDate();

        // Select all session elements within this specific daily schedule container
        const sessions = dailySchedule.querySelectorAll('.wordcamp-schedule__session');

        // Loop through each found session for the current day
        sessions.forEach(session => {
            const titleElement = session.querySelector('.wordcamp-schedule__session-title');
            const timeElement = session.querySelector('p'); // The <p> tag is assumed to contain the time

            // Ensure both title and time elements are found for the session
            if (titleElement && timeElement) {
                const title = encodeURIComponent(titleElement.innerText.trim()); // Get and encode session title
                const timeText = timeElement.innerText.trim(); // Get raw time string (e.g., "10:00 – 11:00 CEST")

                let startTime, endTime;
                let startHour, startMinute, endHour, endMinute;

                // Regex to match time formats like "HH:MM – HH:MM" or "HH:MM" (with optional timezone)
                const timeMatch = timeText.match(/(\d{1,2}:\d{2})\s*(?:[–-]\s*(\d{1,2}:\d{2}))?\s*(CEST)?/i);

                if (timeMatch) {
                    const startStr = timeMatch[1]; // e.g., "10:00"
                    const endStr = timeMatch[2];   // e.g., "11:00" (or undefined if not present)

                    [startHour, startMinute] = startStr.split(':').map(Number);

                    if (endStr) {
                        [endHour, endMinute] = endStr.split(':').map(Number);
                    } else {
                        // If no explicit end time, assume a default duration (e.g., 60 minutes)
                        endHour = startHour + 1;
                        endMinute = startMinute;
                        // Handle potential overflow for endHour (e.g., 23:30 + 1 hour becomes 24:30, adjust to 00:30 next day)
                        if (endHour >= 24) {
                            endHour -= 24;
                            // For simplicity, we assume sessions don't typically span midnight in this context.
                            // If they did, Google Calendar will still handle time past 23:59 correctly for the start date.
                        }
                    }

                    // CEST (Central European Summer Time) is UTC+2.
                    // To convert a CEST time to UTC, subtract 2 hours from the CEST time.
                    startTime = new Date(Date.UTC(currentYear, currentMonth, currentDay, startHour - 2, startMinute));
                    endTime = new Date(Date.UTC(currentYear, currentMonth, currentDay, endHour - 2, endMinute));

                    // Format the Date objects to the string format required by Google Calendar
                    const formattedStartTime = formatGoogleCalendarDate(startTime);
                    const formattedEndTime = formatGoogleCalendarDate(endTime);

                    // Construct the Google Calendar URL
                    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
                                        `&text=${title}` +
                                        `&dates=${formattedStartTime}/${formattedEndTime}` +
                                        `&details=${encodeURIComponent('More info: ' + window.location.href)}` +
                                        `&location=${encodeURIComponent('WordCamp Europe 2025')}`;

                    // Create the "Add to Google Calendar" link element
                    const calendarLink = document.createElement('a');
                    calendarLink.href = calendarUrl;
                    calendarLink.target = '_blank'; // Open in a new tab
                    calendarLink.textContent = 'Add to Google Calendar';

                    // Apply basic styling to make the link visually appealing
                    calendarLink.style.display = 'block'; // Make it take full width
                    calendarLink.style.marginTop = '10px';
                    calendarLink.style.padding = '8px 15px';
                    calendarLink.style.backgroundColor = '#4285F4'; // Google blue
                    calendarLink.style.color = '#ffffff';
                    calendarLink.style.textDecoration = 'none';
                    calendarLink.style.borderRadius = '5px';
                    calendarLink.style.fontSize = '0.9em';
                    calendarLink.style.textAlign = 'center';
                    calendarLink.style.fontWeight = 'bold';
                    calendarLink.style.transition = 'background-color 0.3s ease, transform 0.1s ease';
                    calendarLink.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                    calendarLink.style.maxWidth = '250px'; // Limit width for better appearance
                    calendarLink.style.marginRight = 'auto'; // Center the link if max-width is set
                    calendarLink.style.marginLeft = 'auto';  // Center the link if max-width is set

                    // Add hover effects for a better user experience
                    calendarLink.onmouseover = function() {
                        this.style.backgroundColor = '#357ae8'; // Darker blue on hover
                        this.style.transform = 'translateY(-1px)'; // Slight lift effect
                    };
                    calendarLink.onmouseout = function() {
                        this.style.backgroundColor = '#4285F4'; // Restore original color
                        this.style.transform = 'translateY(0)'; // Remove lift effect
                    };

                    // Append the link to the session block, after the time element
                    // This inserts the new link element directly after the time <p> tag.
                    timeElement.parentNode.insertBefore(calendarLink, timeElement.nextSibling);
                } else {
                    console.warn('Could not parse time for session:', titleElement.innerText, 'Time text:', timeText);
                }
            }
        });
    });
})();
