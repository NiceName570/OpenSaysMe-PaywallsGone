document.addEventListener('DOMContentLoaded', () => {
  // The autoComplete.js Engine instance creator
  const autoCompleteJS = new autoComplete({
    data: {
      src: async () => {
        try {
          // Loading placeholder text
          document
          .getElementById("autoComplete")
          .setAttribute("placeholder", "Loading...");
          // Fetch External Data Source
          const source = await fetch(
          "https://www.oahelper.org/institutes/acl.php", {
            headers: {
              "X-Token": "l6sNUJ3Knh",
            },
          }
          );
          const data = await source.json();
          // Post Loading placeholder text
          document
          .getElementById("autoComplete")
          .setAttribute("placeholder", autoCompleteJS.placeHolder);
          // Returns Fetched data
          return data.data;
        } catch (error) {
          return error;
        }
      },
      keys: ["institution", "domain"],
      cache: true,
      filter: (list) => {
        // Filter duplicates
        // incase of multiple data keys usage
        const filteredResults = Array.from(
        new Set(list.map((value) => value.match))
        ).map((food) => {
          return list.find((value) => value.match === food);
        });
        return filteredResults;
      }
    },
    placeHolder: "Find your institution, search by name or domain",
    resultsList: {
      element: (list, data) => {
        const info = document.createElement("p");
        if (data.results.length > 0) {
          info.append(
            "Displaying ",
            buildElement({ tag: "strong", text: String(data.results.length) }),
            " out of ",
            buildElement({ tag: "strong", text: String(data.matches.length) }),
            " results"
          );
        } else {
          info.append(
            "Found ",
            buildElement({ tag: "strong", text: String(data.matches.length) }),
            " matching results for ",
            buildElement({ tag: "strong", text: `"${data.query}"` })
          );
        }
        list.prepend(info);
      },
      noResults: true,
      maxResults: 15,
      tabSelect: true
    },
    resultItem: {
      element: (item, data) => {
        // Modify Results Item Style
        item.style = "display: flex; justify-content: space-between;";
        // Modify Results Item Content
        item.textContent = "";

        const matchSpan = document.createElement("span");
        matchSpan.style = "text-overflow: ellipsis; white-space: nowrap; overflow: hidden;";
        // data.match is pre-wrapped in <mark> tags by the autoComplete.js highlight option,
        // so it's parsed+allowlist-filtered rather than escaped as plain text.
        matchSpan.appendChild(renderSafeTemplate(data.match, null));

        const keySpan = document.createElement("span");
        keySpan.style = "display: flex; align-items: center; font-size: 13px; font-weight: 100; color: rgba(0,0,0,.2);";
        keySpan.textContent = data.key;

        item.append(matchSpan, keySpan);
      },
      highlight: true
    },
    events: {
      input: {
        focus: () => {
          if (autoCompleteJS.input.value.length) {
            autoCompleteJS.start();
          }
        }
      }
    },
    searchEngine: 'strict'
  });



  autoCompleteJS.input.addEventListener("selection", function (event) {
    const feedback = event.detail;
    autoCompleteJS.input.blur();
    // Prepare User's Selected Value
    const selection = feedback.selection.value[feedback.selection.key];
    // Replace Input value with the selected value
    autoCompleteJS.input.value = selection;
    // Console log autoComplete data feedback
    //alert(feedback.selection.value.id);
    document.getElementById("selectedinstitute").setAttribute("data-institute", feedback.selection.value.id);
    document.getElementById("selectedinstitute").textContent = `${feedback.selection.value.institution} (${feedback.selection.value.id})`;
    loadAndStoreSettingsById(feedback.selection.value.id);
  });
});
