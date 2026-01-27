function parseHTML(html)
{
  return new DOMParser().parseFromString(html, 'text/html');
}

function load(url)
{
  return new Promise(function (resolve, reject) {
    fetch(url).then(response => {
      response.text().then(text => {
        resolve(parseHTML(text));
      }, () => reject());
    }, () => reject());
  });
}

function appendTemplatesToDocument(doc)
{
  doc.querySelectorAll('template').forEach(t => {
    document.body.appendChild(t);
  });
}

function arrayToObject(key, arr)
{
  var obj = {};
  key.forEach((k, i) => {
    if(k) obj[k] = arr[i];
  });
  return obj;
}

function tableTo2DArray(table)
{
  return Array.from(table.querySelectorAll('tr'))
    .map(tr => Array.from(tr.querySelectorAll('td')).map(td => {
      td.innerHTML = td.innerHTML.replace(/<br>/ig, '\n');
      return td.textContent;
    }));
}

function getSubmitFormHeader(arr)
{
  return arr[1]; /* After column number */
}

function getSubmitFormData(arr)
{
  return arr.slice(3) /* Column number, Header, Freeze Separator */
    .map(row => arrayToObject(vm.fields, row));
}

var vm;
var FIELD_PREF_KEY = 'copyFieldsSelection';

function buildMarkdown(fields, data) {
  return fields.filter(Boolean).map(function (field) {
    var value = data[field] ? data[field] : 'None';
    return '## ' + field + '\n\n' + value + '\n';
  }).join('\n').trim() + '\n';
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise(function (resolve, reject) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      resolve();
    } catch (e) {
      reject(e);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}

function showCopyFeedback(message) {
  var existing = document.querySelector('.copy-toast');
  if (existing) {
    existing.parentNode.removeChild(existing);
  }
  var toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = message || 'Copied';
  document.body.appendChild(toast);
  // force reflow for transition
  window.getComputedStyle(toast).opacity;
  toast.classList.add('visible');
  setTimeout(function () {
    toast.classList.remove('visible');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, 1500);
}

function saveFieldPreference(fields) {
  localStorage.setItem(FIELD_PREF_KEY, JSON.stringify(fields));
}


function loadFieldPreference() {
  try {
    var raw = localStorage.getItem(FIELD_PREF_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}


function showFieldSelectorDialog(allFields, preselected) {
  return new Promise(function (resolve) {
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    var card = document.createElement('div');
    card.className = 'modal-card';

    var title = document.createElement('h3');
    title.textContent = 'Select fields to copy';
    card.appendChild(title);

    var hint = document.createElement('p');
    hint.className = 'text-muted small';
    hint.textContent = 'Uncheck fields you want to skip. Your choice will be remembered.';
    card.appendChild(hint);

    var list = document.createElement('div');
    list.className = 'checkbox-list';
    allFields.filter(Boolean).forEach(function (field) {
      var label = document.createElement('label');
      label.className = 'checkbox-row';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = field;
      input.checked = preselected ? preselected.indexOf(field) !== -1 : true;
      var span = document.createElement('span');
      span.textContent = field;
      label.appendChild(input);
      label.appendChild(span);
      list.appendChild(label);
    });
    card.appendChild(list);

    var actions = document.createElement('div');
    actions.className = 'modal-actions';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-inline btn-ghost';
    cancelBtn.textContent = 'Cancel';
    var applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn btn-inline';
    applyBtn.textContent = 'Copy Selected';
    actions.appendChild(cancelBtn);
    actions.appendChild(applyBtn);
    card.appendChild(actions);

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    function cleanup() {
      document.body.removeChild(backdrop);
      document.removeEventListener('keyup', escListener);
    }

    function escListener(e) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    }

    document.addEventListener('keyup', escListener);

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) {
        cleanup();
        resolve(null);
      }
    });

    cancelBtn.addEventListener('click', function () {
      cleanup();
      resolve(null);
    });

    applyBtn.addEventListener('click', function () {
      var selected = Array.from(list.querySelectorAll('input[type=checkbox]'))
        .filter(function (input) { return input.checked; })
        .map(function (input) { return input.value; });
      cleanup();
      resolve(selected);
    });
  });
}

function runApp()
{
  Vue.component('data-view', {
    template: '#data-view',
    props: {
      fields: {
        type: Array
      },
      data: {
        type: Object
      }
    },
    methods: {
      copyAsMarkdown: function () {
        if (!this.fields || this.fields.length === 0) return;
        var markdown = buildMarkdown(this.fields, this.data);
        copyToClipboard(markdown).then(function () {
          showCopyFeedback('Copied submission');
        });
      },
      copyFieldsAsMarkdown: function (evt) {
        var stored = loadFieldPreference();
        var availableFields = this.fields;
        if (!availableFields || availableFields.length === 0) return;
        if (stored && stored.length > 0) {
          stored = stored.filter(function (field) {
            return availableFields.indexOf(field) !== -1;
          });
        }
        var preferStoredOnly = evt && (evt.ctrlKey || evt.metaKey);
        if (preferStoredOnly && stored && stored.length > 0) {
          this.copyWithFields(stored);
          return;
        }
        var self = this;
        showFieldSelectorDialog(availableFields, stored || this.fields).then(function (selected) {
          if (selected && selected.length > 0) {
            saveFieldPreference(selected);
            self.copyWithFields(selected);
          }
        });
      },
      copyWithFields: function (fields) {
        var markdown = buildMarkdown(fields, this.data);
        copyToClipboard(markdown).then(function () {
          showCopyFeedback('Copied selected fields');
        });
      }
    }
  });

  Vue.component('data-field', {
    template: '#data-field',
    props: {
      data: {
        type: Object,
        default: () => {}
      },
      field: {
        type: String,
        default: () => {}
      }
    }
  });

  vm = new Vue({
    el: '#app',
    template: '#t',
    data: function () {
      return {
        db: [],
        fields: [],
        state: 'NOFILE',
        selectedFields: []
      }
    },
    created: function () {
      if(CONFIG.dataFileName) {
        this.state = 'LOADING';
        load(CONFIG.dataFileName).then(doc => {
          let contentDOM = parseHTML(reader.result)
          let arr = tableTo2DArray(contentDOM.querySelector('table'));
          this.fields = getSubmitFormHeader(arr);
          this.db = getSubmitFormData(arr);
        }).catch(() => { this.state = 'ERROR'; });
      }
    },
    watch: {
      fields: function () {
        this.selectedFields = this.fields.slice();
      },
      db: function () {
        this.state = 'DONE'
      }
    },
    computed: {
      displayFields: function () {
        return this.fields.filter(field => this.selectedFields.indexOf(field) !== -1);
      }
    },
    methods: {
      onUploadByButton(e) {
        loadFile(e.target.files[0])
      },
      selectAllFields() {
        this.selectedFields = this.fields.slice();
      },
      clearSelectedFields() {
        this.selectedFields = [];
      },
      changeTheme() {
        let preferredTheme = localStorage.getItem('theme');
        setTheme(preferredTheme === 'dark' ? 'light' : 'dark');
      },
      scrollToTop() {
        var scrollStep = -window.scrollY / (600 / 15);
        var scrollInterval = setInterval(function() {
          if (window.scrollY !== 0) {
            window.scrollBy(0, scrollStep);
          } else {
            clearInterval(scrollInterval);
          }
        }, 15);
      },
      returnToHome() {
        location.reload();
      }
    }
  });
}

/*
load('template.html')
  .then(appendTemplatesToDocument)
  .then(runApp) */

runApp();

document.addEventListener('drop', e => { e.stopPropagation(); e.preventDefault();
  loadFile(e.dataTransfer.files[0]);
}, false);



function loadFile(file){
  var reader = new FileReader();
  reader.addEventListener('loadend', e => {
    if(reader.readyState === FileReader.DONE) {
      if(vm) {
        let contentDOM = parseHTML(reader.result)
        let arr = tableTo2DArray(contentDOM.querySelector('table'));
        vm.fields = getSubmitFormHeader(arr);
        vm.db = getSubmitFormData(arr);
      }
    }
  });
  reader.readAsText(file, 'UTF-8');
  btnReturnToHome.style.pointerEvents = 'all';
  btnReturnToHome.style.opacity = 1; // The return home button only appears after loading the file
}

document.addEventListener('dragover', e => {
  e.stopPropagation();
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}, false);

// vim: et sw=2

// Set the theme
function setTheme(theme) {
  localStorage.setItem('theme', theme);
  document.body.classList.toggle('dark-mode', theme === 'dark');
  switchThemeIcon(theme);
}

// Switch the theme switch button icon
function switchThemeIcon(theme) {
  const btnSwitchTheme = document.getElementById('btnSwitchTheme');
  const iconSpan = btnSwitchTheme.querySelector('.material-symbols-outlined');
  if (theme === 'dark') {
    iconSpan.textContent = 'light_mode';
  } else {
    iconSpan.textContent = 'dark_mode';
  }
}

// Listen to user-preferred theme
window.addEventListener('load', (event) => {
  let preferredTheme = localStorage.getItem('theme');
  let darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (preferredTheme == null) {
    preferredTheme = darkQuery.matches ? 'dark' : 'light';
  }
  darkQuery.addEventListener('change', function (e) {
    setTheme(e.matches ? 'dark' : 'light');
  });
  setTheme(preferredTheme);
});

// smooth scroll-to-top button
document.addEventListener('DOMContentLoaded', function() {
  var btnScrollToTop = document.getElementById('btnScrollToTop');

  // Show or hide the button based on the scroll position
  window.addEventListener('scroll', function() {
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
      btnScrollToTop.style.pointerEvents = 'all';
      btnScrollToTop.style.opacity = 1;
      btnScrollToTop.style.transform = 'translateY(0px)';
      btnSwitchTheme.style.transform = 'translateY(0px)';
      btnReturnToHome.style.transform = 'translateY(0px)';
    } else {
      btnScrollToTop.style.opacity = 0;
      btnScrollToTop.style.pointerEvents = 'none';
      btnScrollToTop.style.transform = 'translateY(55px)';
      btnReturnToHome.style.transform = 'translateY(55px)';
      btnSwitchTheme.style.transform = 'translateY(55px)';
    }
  });
});
