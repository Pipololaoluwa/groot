import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

/* =========================================================
   GLOBAL STATE
========================================================= */

let dictionary = [];
let ttsModel = null;
let ttsLoadingPromise = null;
let currentStudyEntry = null;
let deferredInstallPrompt = null;

const FAVORITES_KEY = "soroSokeFavorites";

const YORUBA_ALPHABET = [
  "A",
  "B",
  "D",
  "E",
  "Ẹ",
  "F",
  "G",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "Ọ",
  "P",
  "R",
  "S",
  "Ṣ",
  "T",
  "U",
  "W",
  "Y"
];

let activeDictionaryLetter = "A";

/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/*
 * Exact comparison normalization.
 *
 * NFC keeps Yoruba characters such as:
 * ẹ, ọ, ṣ, á, à, é, è, etc.
 * as proper Unicode characters.
 */
function normalizeExactYoruba(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/*
 * Search normalization.
 *
 * Used for dictionary searching where tone marks
 * should not prevent a broader search result.
 */
function foldDiacritics(value) {
  return normalizeExactYoruba(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findFirstElement(ids) {
  for (const id of ids) {
    const element = document.getElementById(id);

    if (element) {
      return element;
    }
  }

  return null;
}

/* =========================================================
   DICTIONARY LOOKUP
========================================================= */

function findExactDictionaryEntry(word) {
  const normalized = normalizeExactYoruba(word);

  if (!normalized || !Array.isArray(dictionary)) {
    return null;
  }

  return (
    dictionary.find((item) => {
      if (!item || !item.yo) {
        return false;
      }

      return (
        normalizeExactYoruba(item.yo) === normalized
      );
    }) || null
  );
}

/* =========================================================
   YORUBA ALPHABET GROUPING
========================================================= */

function getDictionaryLetter(word) {
  if (!word) {
    return "";
  }

  const first = String(word)
    .normalize("NFC")
    .trim()
    .charAt(0);

  if (first === "ẹ" || first === "Ẹ") {
    return "Ẹ";
  }

  if (first === "ọ" || first === "Ọ") {
    return "Ọ";
  }

  if (first === "ṣ" || first === "Ṣ") {
    return "Ṣ";
  }

  return first
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/* =========================================================
   STATUS
========================================================= */

function setStatus(message, type = "") {
  const status = document.getElementById("dictionaryStatus");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.className = "dictionary-status";

  if (type) {
    status.classList.add(type);
  }
}

/* =========================================================
   DICTIONARY LOADING
========================================================= */

async function loadDictionary() {
  const status = document.getElementById("dictionaryStatus");

  try {
    if (status) {
      status.textContent = "Loading dictionary…";
      status.className = "dictionary-status";
    }

    const response = await fetch("./dictionary.json", {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(
        `Dictionary request failed: ${response.status}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        "dictionary.json must contain an array."
      );
    }

    const validEntries = data.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.yo === "string" &&
        item.yo.trim() !== ""
    );

    if (validEntries.length === 0) {
      throw new Error(
        "dictionary.json contains no valid Yoruba entries."
      );
    }

    dictionary = validEntries;

    console.log(
      "Dictionary loaded:",
      dictionary.length,
      dictionary[0]
    );

    setStatus(
      `Loaded ${dictionary.length} words.`
    );

    return dictionary;
  } catch (error) {
    console.error(
      "Dictionary loading failed:",
      error
    );

    dictionary = [];

    setStatus(
      "Unable to load the dictionary. Please refresh the page.",
      "error"
    );

    return [];
  }
}

/* =========================================================
   FAVORITES
========================================================= */

function getFavorites() {
  try {
    const saved =
      localStorage.getItem(FAVORITES_KEY);

    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch (error) {
    console.error(
      "Could not read favorites:",
      error
    );

    return [];
  }
}

function saveFavorites(favorites) {
  try {
    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify(favorites)
    );
  } catch (error) {
    console.error(
      "Could not save favorites:",
      error
    );
  }
}

function isFavorite(id) {
  return getFavorites().includes(id);
}

function toggleFavorite(id) {
  const favorites = getFavorites();

  const index = favorites.indexOf(id);

  if (index >= 0) {
    favorites.splice(index, 1);
  } else {
    favorites.push(id);
  }

  saveFavorites(favorites);
}

/* =========================================================
   TEXT TO SPEECH
========================================================= */

async function getTTSModel() {
  if (ttsModel) {
    return ttsModel;
  }

  if (ttsLoadingPromise) {
    return ttsLoadingPromise;
  }

  const status =
    document.getElementById("ttsStatus");

  if (status) {
    status.textContent =
      "Loading Yoruba voice…";
  }

  ttsLoadingPromise = pipeline(
    "text-to-speech",
    "Xenova/mms-tts-yor",
    {
      progress_callback: (progress) => {
        if (!status || !progress) {
          return;
        }

        if (
          progress.status === "progress" &&
          typeof progress.progress === "number"
        ) {
          const percent =
            Math.round(progress.progress);

          status.textContent =
            `Loading Yoruba voice… ${percent}%`;
        }
      }
    }
  );

  try {
    ttsModel = await ttsLoadingPromise;

    if (status) {
      status.textContent =
        "Yoruba voice ready.";
    }

    return ttsModel;
  } catch (error) {
    console.error(
      "TTS loading failed:",
      error
    );

    ttsLoadingPromise = null;

    if (status) {
      status.textContent =
        "Yoruba voice could not be loaded.";
    }

    throw error;
  }
}

function createWavBlob(audio, sampleRate) {
  const buffer =
    new ArrayBuffer(
      44 + audio.length * 2
    );

  const view =
    new DataView(buffer);

  function writeString(offset, string) {
    for (
      let i = 0;
      i < string.length;
      i += 1
    ) {
      view.setUint8(
        offset + i,
        string.charCodeAt(i)
      );
    }
  }

  writeString(0, "RIFF");

  view.setUint32(
    4,
    36 + audio.length * 2,
    true
  );

  writeString(8, "WAVE");
  writeString(12, "fmt ");

  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);

  view.setUint32(
    24,
    sampleRate,
    true
  );

  view.setUint32(
    28,
    sampleRate * 2,
    true
  );

  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeString(36, "data");

  view.setUint32(
    40,
    audio.length * 2,
    true
  );

  let offset = 44;

  for (
    let i = 0;
    i < audio.length;
    i += 1
  ) {
    const sample =
      Math.max(
        -1,
        Math.min(1, audio[i])
      );

    view.setInt16(
      offset,
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff,
      true
    );

    offset += 2;
  }

  return new Blob(
    [view],
    {
      type: "audio/wav"
    }
  );
}

async function speakText(text) {
  const cleanText =
    String(text ?? "").trim();

  if (!cleanText) {
    return;
  }

  try {
    const model =
      await getTTSModel();

    const output =
      await model(cleanText);

    if (
      !output ||
      !output.audio
    ) {
      throw new Error(
        "No audio returned."
      );
    }

    const wavBlob =
      createWavBlob(
        output.audio,
        output.sampling_rate || 16000
      );

    const url =
      URL.createObjectURL(wavBlob);

    const audio =
      new Audio(url);

    audio.addEventListener(
      "ended",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );

    audio.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );

    await audio.play();
  } catch (error) {
    console.error(
      "Speech failed:",
      error
    );
  }
}

window.speakText = speakText;

/* =========================================================
   SPEAK TAB
   PUT YORUBA INTO WORDS
========================================================= */

function updateSpeakDictionaryResult(text) {
  /*
   * THESE ARE THE ACTUAL IDS FROM index.html.
   */

  const wordElement =
    document.getElementById("resultWord");

  const meaningElement =
    document.getElementById("resultMeaning");

  const noteElement =
    document.getElementById("resultNote");

  const favoriteButton =
    document.getElementById("favoriteCurrent");

  /*
   * Empty state.
   */

  if (!text) {
    if (wordElement) {
      wordElement.textContent = "—";
    }

    if (meaningElement) {
      meaningElement.textContent =
        "Type a Yoruba word to see its meaning.";
    }

    if (noteElement) {
      noteElement.textContent =
        "Dictionary meanings are only shown for exact verified entries.";
    }

    if (favoriteButton) {
      favoriteButton.hidden = true;
      favoriteButton.dataset.wordId = "";
    }

    return;
  }

  /*
   * Always show what the user typed.
   */

  if (wordElement) {
    wordElement.textContent = text;
  }

  /*
   * Search the loaded dictionary.
   */

  const entry =
    findExactDictionaryEntry(text);

  /*
   * No exact match.
   */

  if (!entry) {
    if (meaningElement) {
      meaningElement.textContent =
        "This word is not yet in our verified dictionary.";
    }

    if (noteElement) {
      noteElement.textContent =
        "Dictionary meanings are only shown for exact verified entries.";
    }

    if (favoriteButton) {
      favoriteButton.hidden = true;
      favoriteButton.dataset.wordId = "";
    }

    return;
  }

  /*
   * EXACT MATCH FOUND.
   */

  if (wordElement) {
    wordElement.textContent =
      entry.yo;
  }

  if (meaningElement) {
    meaningElement.textContent =
      entry.en ||
      "Meaning not available.";
  }

  if (noteElement) {
    if (entry.category) {
      noteElement.textContent =
        `${entry.category} · Verified dictionary entry`;
    } else {
      noteElement.textContent =
        "Verified dictionary entry.";
    }
  }

  /*
   * Show Save Word button for verified entries.
   */

  if (favoriteButton) {
    favoriteButton.hidden = false;
    favoriteButton.dataset.wordId =
      String(entry.id);

    updateHomeFavoriteButton(entry);
  }
}

/* =========================================================
   HOME FAVORITE BUTTON
========================================================= */

function updateHomeFavoriteButton(entry) {
  const button =
    document.getElementById(
      "favoriteCurrent"
    );

  if (!button || !entry) {
    return;
  }

  const saved =
    isFavorite(entry.id);

  button.textContent =
    saved
      ? "♥ Saved"
      : "♡ Save word";

  button.setAttribute(
    "aria-pressed",
    String(saved)
  );
}

function initHomeFavoriteButton() {
  const button =
    document.getElementById(
      "favoriteCurrent"
    );

  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    () => {
      const id =
        Number(
          button.dataset.wordId
        );

      if (!id) {
        return;
      }

      toggleFavorite(id);

      const entry =
        dictionary.find(
          (item) =>
            Number(item.id) === id
        );

      if (entry) {
        updateHomeFavoriteButton(
          entry
        );
      }
    }
  );
}

/* =========================================================
   HOME / SPEAK PAGE
========================================================= */

function initHomePage() {
  /*
   * IMPORTANT:
   * index.html uses #yorubaText.
   */

  const input =
    document.getElementById(
      "yorubaText"
    );

  const speakButton =
    document.getElementById(
      "speakButton"
    );

  const clearButton =
    document.getElementById(
      "clearButton"
    );

  const status =
    document.getElementById(
      "status"
    );

  /*
   * Safety check.
   */

  if (!input) {
    console.error(
      "Speak input #yorubaText was not found."
    );

    return;
  }

  /*
   * Update meaning immediately as the user types.
   */

  input.addEventListener(
    "input",
    () => {
      const text =
        input.value.trim();

      updateSpeakDictionaryResult(
        text
      );

      if (status) {
        status.textContent =
          text
            ? "Ready."
            : "Ready.";
      }
    }
  );

  /*
   * Hear pronunciation.
   */

  if (speakButton) {
    speakButton.addEventListener(
      "click",
      async () => {
        const text =
          input.value.trim();

        if (!text) {
          if (status) {
            status.textContent =
              "Type some Yoruba first.";
          }

          input.focus();
          return;
        }

        /*
         * Update meaning before speaking.
         */

        updateSpeakDictionaryResult(
          text
        );

        if (status) {
          status.textContent =
            "Speaking…";
        }

        await speakText(text);

        if (status) {
          status.textContent =
            "Ready.";
        }
      }
    );
  }

  /*
   * Ctrl + Enter / Cmd + Enter
   * also speaks.
   */

  input.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        (event.ctrlKey ||
          event.metaKey)
      ) {
        event.preventDefault();

        if (speakButton) {
          speakButton.click();
        }
      }
    }
  );

  /*
   * Clear.
   */

  if (clearButton) {
    clearButton.addEventListener(
      "click",
      () => {
        input.value = "";

        updateSpeakDictionaryResult(
          ""
        );

        if (status) {
          status.textContent =
            "Ready.";
        }

        input.focus();
      }
    );
  }

  /*
   * Save word.
   */

  initHomeFavoriteButton();

  /*
   * Initialize result area.
   */

  updateSpeakDictionaryResult(
    input.value.trim()
  );
}

/* =========================================================
   DICTIONARY PAGE
========================================================= */

function initDictionaryPage() {
  if (dictionary.length === 0) {
    console.error(
      "Dictionary page initialized with no entries."
    );

    setStatus(
      "No dictionary entries were loaded.",
      "error"
    );

    return;
  }

  populateCategories();
  createAlphabetButtons();
  renderDictionary();

  const search =
    document.getElementById(
      "dictionarySearch"
    );

  const select =
    document.getElementById(
      "categorySelect"
    );

  const closeStudy =
    document.getElementById(
      "closeStudy"
    );

  if (search) {
    search.addEventListener(
      "input",
      renderDictionary
    );
  }

  if (select) {
    select.addEventListener(
      "change",
      renderDictionary
    );
  }

  if (closeStudy) {
    closeStudy.addEventListener(
      "click",
      closeWordStudy
    );
  }

  const params =
    new URLSearchParams(
      window.location.search
    );

  const requestedWord =
    params.get("word");

  if (requestedWord) {
    const entry =
      findExactDictionaryEntry(
        requestedWord
      );

    if (entry) {
      activeDictionaryLetter =
        getDictionaryLetter(
          entry.yo
        );

      updateAlphabetButtons();
      openWordStudy(entry);
    }
  }
}

/* =========================================================
   DICTIONARY ALPHABET
========================================================= */

function createAlphabetButtons() {
  const container =
    document.getElementById(
      "alphabetButtons"
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  YORUBA_ALPHABET.forEach(
    (letter) => {
      const button =
        document.createElement(
          "button"
        );

      button.type = "button";
      button.className =
        "alphabet-button";

      button.dataset.letter =
        letter;

      const count =
        dictionary.filter(
          (item) =>
            getDictionaryLetter(
              item.yo
            ) === letter
        ).length;

      button.innerHTML = `
        <strong>${escapeHTML(letter)}</strong>
        <span>${count}</span>
      `;

      button.setAttribute(
        "aria-label",
        `${letter}, ${count} ${
          count === 1
            ? "word"
            : "words"
        }`
      );

      button.addEventListener(
        "click",
        () => {
          activeDictionaryLetter =
            letter;

          const search =
            document.getElementById(
              "dictionarySearch"
            );

          const select =
            document.getElementById(
              "categorySelect"
            );

          if (search) {
            search.value = "";
          }

          if (select) {
            select.value = "All";
          }

          closeWordStudy();
          renderDictionary();
        }
      );

      container.appendChild(
        button
      );
    }
  );

  updateAlphabetButtons();
}

function updateAlphabetButtons() {
  document
    .querySelectorAll(
      ".alphabet-button"
    )
    .forEach((button) => {
      const active =
        button.dataset.letter ===
        activeDictionaryLetter;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-pressed",
        String(active)
      );
    });
}

/* =========================================================
   CATEGORIES
========================================================= */

function populateCategories() {
  const select =
    document.getElementById(
      "categorySelect"
    );

  const buttons =
    document.getElementById(
      "categoryButtons"
    );

  if (!select || !buttons) {
    return;
  }

  const categories =
    [
      ...new Set(
        dictionary
          .map(
            (item) =>
              String(
                item.category ?? ""
              ).trim()
          )
          .filter(Boolean)
      )
    ].sort((a, b) =>
      a.localeCompare(
        b,
        "en",
        {
          sensitivity: "base"
        }
      )
    );

  select.innerHTML = "";

  const allOption =
    document.createElement(
      "option"
    );

  allOption.value = "All";
  allOption.textContent =
    "All categories";

  select.appendChild(
    allOption
  );

  categories.forEach(
    (category) => {
      const option =
        document.createElement(
          "option"
        );

      option.value = category;
      option.textContent =
        category;

      select.appendChild(
        option
      );
    }
  );

  const favoritesOption =
    document.createElement(
      "option"
    );

  favoritesOption.value =
    "Favorites";

  favoritesOption.textContent =
    "♥ Favorites";

  select.appendChild(
    favoritesOption
  );

  buttons.innerHTML = "";

  createCategoryButton(
    buttons,
    "All",
    "All"
  );

  categories.forEach(
    (category) => {
      createCategoryButton(
        buttons,
        category,
        category
      );
    }
  );

  createCategoryButton(
    buttons,
    "Favorites",
    "♥ Favorites"
  );
}

function createCategoryButton(
  container,
  value,
  label
) {
  const button =
    document.createElement(
      "button"
    );

  button.type = "button";
  button.className =
    "category-button";

  button.textContent =
    label;

  button.dataset.category =
    value;

  button.addEventListener(
    "click",
    () => {
      const select =
        document.getElementById(
          "categorySelect"
        );

      if (select) {
        select.value = value;
      }

      renderDictionary();
    }
  );

  container.appendChild(
    button
  );
}

/* =========================================================
   DICTIONARY FILTERING
========================================================= */

function getFilteredDictionary() {
  const search =
    document.getElementById(
      "dictionarySearch"
    );

  const select =
    document.getElementById(
      "categorySelect"
    );

  const searchTerm =
    foldDiacritics(
      search?.value || ""
    );

  const category =
    select?.value || "All";

  return dictionary.filter(
    (item) => {
      const matchesSearch =
        !searchTerm ||
        foldDiacritics(
          item.yo
        ).includes(searchTerm) ||
        foldDiacritics(
          item.en
        ).includes(searchTerm);

      const matchesLetter =
        Boolean(searchTerm) ||
        getDictionaryLetter(
          item.yo
        ) === activeDictionaryLetter;

      let matchesCategory =
        true;

      if (
        category ===
        "Favorites"
      ) {
        matchesCategory =
          isFavorite(item.id);
      } else if (
        category !== "All"
      ) {
        matchesCategory =
          item.category ===
          category;
      }

      return (
        matchesSearch &&
        matchesLetter &&
        matchesCategory
      );
    }
  );
}

/* =========================================================
   DICTIONARY RENDERING
========================================================= */

function renderDictionary() {
  const grid =
    document.getElementById(
      "dictionaryGrid"
    );

  const search =
    document.getElementById(
      "dictionarySearch"
    );

  const select =
    document.getElementById(
      "categorySelect"
    );

  if (
    !grid ||
    !search ||
    !select
  ) {
    return;
  }

  const searchTerm =
    foldDiacritics(
      search.value
    );

  const category =
    select.value;

  let results =
    getFilteredDictionary();

  results.sort(
    (a, b) =>
      String(a.yo ?? "").localeCompare(
        String(b.yo ?? ""),
        "yo",
        {
          sensitivity: "base"
        }
      )
  );

  grid.innerHTML = "";

  if (results.length === 0) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "dictionary-empty";

    empty.innerHTML = `
      <strong>No words found.</strong>
      <span>
        Try another search, letter, or category.
      </span>
    `;

    grid.appendChild(
      empty
    );
  } else {
    results.forEach(
      (item) => {
        grid.appendChild(
          createWordCard(item)
        );
      }
    );
  }

  if (searchTerm) {
    setStatus(
      `${results.length} ${
        results.length === 1
          ? "word"
          : "words"
      } found`
    );

    hideLetterHeading();
  } else {
    const totalLetterCount =
      dictionary.filter(
        (item) =>
          getDictionaryLetter(
            item.yo
          ) ===
          activeDictionaryLetter
      ).length;

    setStatus(
      `${results.length} ${
        results.length === 1
          ? "word"
          : "words"
      }`
    );

    showLetterHeading(
      activeDictionaryLetter,
      totalLetterCount,
      results.length
    );
  }

  updateCategoryButtons(
    category
  );

  updateAlphabetButtons();
}

/* =========================================================
   LETTER HEADING
========================================================= */

function showLetterHeading(
  letter,
  totalCount,
  visibleCount
) {
  const heading =
    document.getElementById(
      "dictionaryLetterHeading"
    );

  const activeHeading =
    document.getElementById(
      "activeLetterHeading"
    );

  const count =
    document.getElementById(
      "activeLetterCount"
    );

  if (heading) {
    heading.hidden = false;
  }

  if (activeHeading) {
    activeHeading.textContent =
      letter;
  }

  if (count) {
    if (
      visibleCount !==
      totalCount
    ) {
      count.textContent =
        `${visibleCount} of ${totalCount} words`;
    } else {
      count.textContent =
        `${totalCount} ${
          totalCount === 1
            ? "word"
            : "words"
        }`;
    }
  }
}

function hideLetterHeading() {
  const heading =
    document.getElementById(
      "dictionaryLetterHeading"
    );

  if (heading) {
    heading.hidden = true;
  }
}

/* =========================================================
   CATEGORY BUTTON STATE
========================================================= */

function updateCategoryButtons(
  activeCategory
) {
  document
    .querySelectorAll(
      ".category-button"
    )
    .forEach((button) => {
      const active =
        button.dataset.category ===
        activeCategory;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-pressed",
        String(active)
      );
    });
}

/* =========================================================
   WORD CARDS
========================================================= */

function createWordCard(item) {
  const article =
    document.createElement(
      "article"
    );

  article.className =
    "word-card";

  const top =
    document.createElement(
      "div"
    );

  top.className =
    "word-card-top";

  const category =
    document.createElement(
      "span"
    );

  category.className =
    "word-category";

  category.textContent =
    item.category ||
    "Yoruba";

  const favorite =
    document.createElement(
      "button"
    );

  favorite.type = "button";
  favorite.className =
    "card-favorite";

  updateCardFavorite(
    favorite,
    item
  );

  favorite.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      toggleFavorite(
        item.id
      );

      renderDictionary();

      if (
        currentStudyEntry &&
        currentStudyEntry.id ===
          item.id
      ) {
        updateStudyFavorite();
      }
    }
  );

  top.appendChild(
    category
  );

  top.appendChild(
    favorite
  );

  const word =
    document.createElement(
      "div"
    );

  word.className =
    "word-card-word";

  word.textContent =
    item.yo || "—";

  const meaning =
    document.createElement(
      "div"
    );

  meaning.className =
    "word-card-meaning";

  meaning.textContent =
    item.en || "—";

  article.appendChild(top);
  article.appendChild(word);
  article.appendChild(meaning);

  if (item.example) {
    const example =
      document.createElement(
        "div"
      );

    example.className =
      "word-card-example";

    example.textContent =
      item.example;

    if (item.exampleEn) {
      const exampleEn =
        document.createElement(
          "div"
        );

      exampleEn.className =
        "word-card-example-en";

      exampleEn.textContent =
        item.exampleEn;

      example.appendChild(
        exampleEn
      );
    }

    article.appendChild(
      example
    );
  }

  const actions =
    document.createElement(
      "div"
    );

  actions.className =
    "word-card-actions";

  const listen =
    document.createElement(
      "button"
    );

  listen.type = "button";
  listen.className =
    "word-card-listen";

  listen.textContent =
    "🔊 Hear";

  listen.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      speakText(item.yo);
    }
  );

  const link =
    document.createElement(
      "a"
    );

  link.className =
    "word-card-link";

  link.href =
    `./dictionary.html?word=${encodeURIComponent(
      item.yo
    )}`;

  link.textContent =
    "Study this word →";

  actions.appendChild(
    listen
  );

  actions.appendChild(
    link
  );

  article.appendChild(
    actions
  );

  return article;
}

function updateCardFavorite(
  button,
  item
) {
  const saved =
    isFavorite(item.id);

  button.textContent =
    saved ? "♥" : "♡";

  button.setAttribute(
    "aria-label",
    saved
      ? "Remove from favorites"
      : "Save word"
  );

  button.setAttribute(
    "aria-pressed",
    String(saved)
  );
}

/* =========================================================
   WORD STUDY
========================================================= */

function openWordStudy(entry) {
  if (!entry) {
    return;
  }

  currentStudyEntry =
    entry;

  const study =
    document.getElementById(
      "wordStudy"
    );

  if (!study) {
    return;
  }

  const studyWord =
    document.getElementById(
      "studyWord"
    );

  const studyMeaning =
    document.getElementById(
      "studyMeaning"
    );

  const studyExample =
    document.getElementById(
      "studyExample"
    );

  const studyExampleEn =
    document.getElementById(
      "studyExampleEn"
    );

  const studyCategory =
    document.getElementById(
      "studyCategory"
    );

  const studySpelling =
    document.getElementById(
      "studySpelling"
    );

  const studyLetters =
    document.getElementById(
      "studyLetters"
    );

  const studyTones =
    document.getElementById(
      "studyTones"
    );

  const studySpeak =
    document.getElementById(
      "studySpeak"
    );

  if (studyWord) {
    studyWord.textContent =
      entry.yo || "—";
  }

  if (studyMeaning) {
    studyMeaning.textContent =
      entry.en || "—";
  }

  if (studyExample) {
    studyExample.textContent =
      entry.example ||
      "No example available.";
  }

  if (studyExampleEn) {
    studyExampleEn.textContent =
      entry.exampleEn || "";
  }

  if (studyCategory) {
    studyCategory.textContent =
      entry.category ||
      "Yoruba";
  }

  if (studySpelling) {
    studySpelling.innerHTML =
      createSpellingGuide(
        entry.yo
      );
  }

  if (studyLetters) {
    studyLetters.innerHTML =
      createLetterGuide(
        entry.yo
      );
  }

  if (studyTones) {
    studyTones.innerHTML =
      createToneGuide(
        entry.yo
      );
  }

  updateStudyFavorite();

  if (studySpeak) {
    studySpeak.onclick =
      () => {
        speakText(entry.yo);
      };
  }

  study.hidden = false;

  study.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =========================================================
   CLOSE WORD STUDY
========================================================= */

function closeWordStudy() {
  const study =
    document.getElementById(
      "wordStudy"
    );

  if (study) {
    study.hidden = true;
  }

  currentStudyEntry = null;
}

/* =========================================================
   WORD STUDY FAVORITE
========================================================= */

function updateStudyFavorite() {
  const button =
    document.getElementById(
      "studyFavorite"
    );

  if (
    !button ||
    !currentStudyEntry
  ) {
    return;
  }

  const saved =
    isFavorite(
      currentStudyEntry.id
    );

  button.textContent =
    saved
      ? "♥ Saved"
      : "♡ Save word";

  button.setAttribute(
    "aria-pressed",
    String(saved)
  );

  button.onclick =
    () => {
      if (!currentStudyEntry) {
        return;
      }

      toggleFavorite(
        currentStudyEntry.id
      );

      updateStudyFavorite();
      renderDictionary();
    };
}

/* =========================================================
   WORD STUDY — SPELLING
========================================================= */

function createSpellingGuide(word) {
  if (!word) {
    return "—";
  }

  const characters =
    [
      ...String(word).normalize("NFC")
    ];

  return characters
    .map((character) => {
      if (character === " ") {
        return " ";
      }

      return `
        <span class="spelling-character">
          ${escapeHTML(character)}
        </span>
      `;
    })
    .join("");
}

/* =========================================================
   WORD STUDY — LETTERS
========================================================= */

function createLetterGuide(word) {
  if (!word) {
    return "—";
  }

  const notices = [];

  const normalized =
    String(word).normalize("NFC");

  if (
    normalized.includes("ẹ") ||
    normalized.includes("Ẹ")
  ) {
    notices.push("Ẹ");
  }

  if (
    normalized.includes("ọ") ||
    normalized.includes("Ọ")
  ) {
    notices.push("Ọ");
  }

  if (
    normalized.includes("ṣ") ||
    normalized.includes("Ṣ")
  ) {
    notices.push("Ṣ");
  }

  const uniqueNotices =
    [...new Set(notices)];

  if (
    uniqueNotices.length === 0
  ) {
    return `
      <span class="mark-chip">
        Ordinary Yoruba letters
      </span>
    `;
  }

  return uniqueNotices
    .map(
      (letter) => `
        <span class="mark-chip">
          ${escapeHTML(letter)}
        </span>
      `
    )
    .join("");
}

/* =========================================================
   WORD STUDY — TONES
========================================================= */

function createToneGuide(word) {
  if (!word) {
    return "—";
  }

  const tones = [];

  const normalized =
    String(word).normalize("NFC");

  for (
    const character of normalized
  ) {
    if (
      "áéíóúÁÉÍÓÚ".includes(
        character
      )
    ) {
      tones.push({
        character,
        tone: "High"
      });
    }

    if (
      "àèìòùÀÈÌÒÙ".includes(
        character
      )
    ) {
      tones.push({
        character,
        tone: "Low"
      });
    }

    if (
      "āēīōūĀĒĪŌŪ".includes(
        character
      )
    ) {
      tones.push({
        character,
        tone: "Mid"
      });
    }
  }

  if (tones.length === 0) {
    return `
      <span class="tone-item">
        No marked tone vowel detected.
      </span>
    `;
  }

  return tones
    .map(
      (item) => `
        <span class="tone-item">
          <strong>
            ${escapeHTML(item.character)}
          </strong>
          <span>
            ${item.tone}
          </span>
        </span>
      `
    )
    .join("");
}

/* =========================================================
   LEARN PAGE — CLICK/TAP TO HEAR
========================================================= */

function initLearnSoundItems() {
  document
    .querySelectorAll(
      ".sound-item[data-speak]"
    )
    .forEach((item) => {
      if (
        item.dataset.soundInitialized ===
        "true"
      ) {
        return;
      }

      item.dataset.soundInitialized =
        "true";

      const play = () => {
        const text =
          item.dataset.speak;

        if (!text) {
          return;
        }

        item.classList.remove(
          "is-speaking"
        );

        void item.offsetWidth;

        item.classList.add(
          "is-speaking"
        );

        speakText(text);

        window.setTimeout(
          () => {
            item.classList.remove(
              "is-speaking"
            );
          },
          450
        );
      };

      item.addEventListener(
        "click",
        play
      );

      item.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            play();
          }
        }
      );
    });
}

/* =========================================================
   GENERAL CLICK-TO-SPEAK
========================================================= */

function initSpeakElements() {
  document
    .querySelectorAll(
      "[data-speak]"
    )
    .forEach((element) => {
      if (
        element.classList.contains(
          "sound-item"
        )
      ) {
        return;
      }

      if (
        element.dataset.speakInitialized ===
        "true"
      ) {
        return;
      }

      element.dataset.speakInitialized =
        "true";

      element.addEventListener(
        "click",
        () => {
          const text =
            element.dataset.speak;

          if (text) {
            speakText(text);
          }
        }
      );

      element.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();

            const text =
              element.dataset.speak;

            if (text) {
              speakText(text);
            }
          }
        }
      );
    });
}

/* =========================================================
   CONTRIBUTION PAGE
========================================================= */

function initContributionPage() {
  const form =
    document.getElementById(
      "contributionForm"
    );

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      const message =
        document.getElementById(
          "contributionMessage"
        );

      if (message) {
        message.textContent =
          "Thank you for helping Sọ̀rọ̀ Sókè grow.";
      }

      form.reset();
    }
  );
}

/* =========================================================
   PWA INSTALL
========================================================= */

window.addEventListener(
  "beforeinstallprompt",
  (event) => {
    event.preventDefault();

    deferredInstallPrompt =
      event;

    const installButton =
      document.getElementById(
        "installAppBtn"
      );

    if (installButton) {
      installButton.hidden =
        false;
    }
  }
);

document.addEventListener(
  "click",
  async (event) => {
    const target =
      event.target;

    if (
      !(target instanceof Element)
    ) {
      return;
    }

    const installButton =
      target.closest(
        "#installAppBtn"
      );

    if (
      !installButton ||
      !deferredInstallPrompt
    ) {
      return;
    }

    try {
      deferredInstallPrompt.prompt();

      const { outcome } =
        await deferredInstallPrompt
          .userChoice;

      if (
        outcome === "accepted"
      ) {
        installButton.hidden =
          true;
      }
    } catch (error) {
      console.error(
        "Install prompt failed:",
        error
      );
    }

    deferredInstallPrompt =
      null;
  }
);

window.addEventListener(
  "appinstalled",
  () => {
    const installButton =
      document.getElementById(
        "installAppBtn"
      );

    if (installButton) {
      installButton.hidden =
        true;
    }

    console.log(
      "Sọ̀rọ̀ Sókè installed."
    );
  }
);

/* =========================================================
   SERVICE WORKER / PWA
========================================================= */

if (
  "serviceWorker" in navigator
) {
  window.addEventListener(
    "load",
    async () => {
      try {
        const registration =
          await navigator.serviceWorker.register(
            "./service-worker.js"
          );

        console.log(
          "Sọ̀rọ̀ Sókè PWA ready."
        );

        await registration.update();
      } catch (error) {
        console.error(
          "PWA registration failed:",
          error
        );
      }
    }
  );
}

/* =========================================================
   BRAND ICON
========================================================= */

function initBrandIcon() {
  const icon =
    document.getElementById(
      "brandIcon"
    );

  if (!icon) {
    return;
  }

  const icons = [
    "./icon-512.png",
    "./icon-192.png"
  ];

  let current = 0;

  window.setInterval(
    () => {
      icon.classList.add(
        "brand-icon-changing"
      );

      window.setTimeout(
        () => {
          current =
            (current + 1) %
            icons.length;

          icon.src =
            icons[current];

          window.setTimeout(
            () => {
              icon.classList.remove(
                "brand-icon-changing"
              );
            },
            150
          );
        },
        150
      );
    },
    2500
  );
}

/* =========================================================
   STARTUP
========================================================= */

async function initApp() {

  /*
   * Start the animated brand icon.
   */
  initBrandIcon();

  const page =
    document.body.dataset.page;

  console.log(
    "Sọ̀rọ̀ Sókè starting:",
    page
  );

  /*
   * HOME / SPEAK
   *
   * Load dictionary BEFORE initializing
   * the Speak interface.
   */

  if (page === "home") {
    const loaded =
      await loadDictionary();

    if (
      loaded.length === 0
    ) {
      console.error(
        "Home page cannot initialize because dictionary failed to load."
      );

      return;
    }

    initHomePage();

    /*
     * Hero "Hear ẹ ṣé" and other
     * data-speak elements.
     */
    initSpeakElements();

    return;
  }

  /*
   * DICTIONARY
   */

  if (page === "dictionary") {
    const loaded =
      await loadDictionary();

    if (
      loaded.length === 0
    ) {
      return;
    }

    initDictionaryPage();
    initSpeakElements();

    return;
  }

  /*
   * LEARN
   */

  if (page === "learn") {
  initLearnSoundItems();
  initSpeakElements();

  return;
}

/*
 * LESSON
 */

if (page === "lesson") {
  initSpeakElements();

  return;
}

/*
 * LESSON
 */

if (page === "lesson") {
  initSpeakElements();

  return;
}

  /*
   * CONTRIBUTE
   */

  if (page === "contribute") {
    initContributionPage();
    initSpeakElements();

    return;
  }
  if (page === "lesson") {
  initSpeakElements();
  return;
}

  /*
   * Unknown page.
   */

  console.warn(
    "Unknown Sọ̀rọ̀ Sókè page:",
    page
  );
}

/* =========================================================
   START APPLICATION
========================================================= */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initApp,
    {
      once: true
    }
  );
} else {
  initApp();
}