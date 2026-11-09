// =============================================================================
//  DOLE LES BAINS – viewer Sketchfab + arborescence de calques (afficher/masquer)
//  Les réglages (ordre, dossiers, couleurs, lien info) sont dans le fichier HTML.
// =============================================================================

// ----------------------------- RÉGLAGES (lus dans le HTML) -------------------
var LIEN_ARBRES_REMARQUABLES = window.LIEN_ARBRES_REMARQUABLES || "page_arbres_remarquables.pdf";
var ORDRE_CALQUES = window.ORDRE_CALQUES || [];
var GROUPES_CALQUES = window.GROUPES_CALQUES || [];
var ORDRE_SOUS_CALQUES = window.ORDRE_SOUS_CALQUES || {};
var RENOMMER_CALQUES = window.RENOMMER_CALQUES || {};
var COULEURS_CALQUES = window.COULEURS_CALQUES || {};
var DOSSIERS_OUVERTS = window.DOSSIERS_OUVERTS_PAR_DEFAUT === true;

// Palette des onglets principaux (utilisée dans l'ordre, puis on recommence)
var PALETTE = [
  "#22c55e", // vert
  "#38bdf8", // bleu ciel
  "#f59e0b", // orange
  "#a78bfa", // violet
  "#f472b6", // rose
  "#2dd4bf", // turquoise
  "#facc15", // jaune
  "#fb7185", // corail
  "#60a5fa"  // bleu
];

// ----------------------------- OUTILS ----------------------------------------
// Simplifie un nom : minuscules, sans accents, "_" et "-" remplacés par des espaces
function norm(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Nom utilisable comme classe CSS : "CHEMINS ANCIENS" -> "chemins-anciens"
function slug(name) {
  return norm(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Clé de comparaison tolérante : accents ignorés, et caractères corrompus
// venant de Sketchfab (ï¿½, \uFFFD, Ã©...) remplacés par un joker "*"
var MOJIBAKE = /(?:[\u00ef\u00cf]\u00bf\u00bd|\ufffd|[\u00c2\u00c3][\u0080-\u00bf])+/g;
function cle(name) {
  return String(name || "")
    .replace(MOJIBAKE, "*")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9*]+/g, "");
}
function motif(k) { return new RegExp("^" + k.replace(/\*/g, "[a-z]?") + "$"); }
function memeNom(a, b) {
  var ka = cle(a), kb = cle(b);
  return ka === kb || motif(ka).test(kb) || motif(kb).test(ka);
}
// Position de "name" dans une liste de noms (-1 si absent), accents/corruption tolérés
function trouverIndex(liste, name) {
  for (var i = 0; i < liste.length; i++) if (memeNom(liste[i], name)) return i;
  return -1;
}
// Texte affiché : le nom écrit dans le HTML (label) si le calque y est listé
function libelle(n) {
  if (n.label) return n.label;
  return String(n.name).replace(MOJIBAKE, "\u00e9").replace(/_/g, " ");
}

// Couleur imposée dans COULEURS_CALQUES (sinon couleur de la palette)
var couleursNorm = {};
Object.keys(COULEURS_CALQUES).forEach(function (k) {
  couleursNorm[norm(k)] = COULEURS_CALQUES[k];
});
function couleurPour(name, index) {
  return couleursNorm[norm(name)] || PALETTE[index % PALETTE.length];
}

function isArbresRemarquables(name) {
  var clean = norm(name);
  return clean.includes("arbre") && clean.includes("remarquable");
}

// Les "dossiers" créés dans le HTML n'existent pas dans le modèle 3D
function isVirtualId(id) {
  return typeof id === "string" && id.indexOf("dossier_") === 0;
}

// Affiche / masque un objet 3D (ignore les dossiers virtuels)
function setVisible(api, id, visible) {
  if (!api || isVirtualId(id)) return;
  if (visible) api.show(id);
  else api.hide(id);
}

// Icône "info" cliquable
function createInfoLink(url) {
  var a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = "layer-info-link";
  a.title = "En savoir plus (ouvrir la page)";
  a.setAttribute("aria-label", "Informations sur ce calque");
  a.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="10"></circle>' +
    '<line x1="12" y1="16" x2="12" y2="12"></line>' +
    '<line x1="12" y1="8" x2="12.01" y2="8"></line>' +
    '</svg>';
  a.addEventListener("click", function (e) {
    e.stopPropagation();
  });
  return a;
}

// Quand on coche un sous-calque, on réaffiche ses dossiers parents
function ensureParentsVisible(checkbox, apiInstance) {
  var currentApi = apiInstance || sketchfabApi;
  var current = checkbox.closest("ul.nested");
  while (current && current.id) {
    var parentCb = document.getElementById("check_" + current.id);
    if (parentCb && !parentCb.checked) {
      parentCb.checked = true;
      setVisible(currentApi, parentCb.value, true);
    }
    current = current.parentElement ? current.parentElement.closest("ul.nested") : null;
  }
}

// ----------------------------- SKETCHFAB -------------------------------------
var version = "1.9.0";
var uid = window.SKETCHFAB_UID || "5351ee6a130d4811adfcf04f3903e322";
var sketchfabApi = null;

var urlParams = new URLSearchParams(window.location.search);
var autoSpin = 0.0;
if (urlParams.has("autospin")) autoSpin = urlParams.get("autospin");
if (urlParams.has("id")) uid = urlParams.get("id");

var iframe = document.getElementById("api-frame");
var client = new window.Sketchfab(version, iframe);

var error = function () {
  console.error("Sketchfab API error");
};

var idxNodes = 0;
var myNodesByNameFromMap = {};
var officialNodes = [];
var rootNodeTree;

var success = function (api) {
  api.start(function () {
    api.addEventListener("viewerready", function () {
      initBarreVues(api);
      api.getNodeMap(function (err, nodes) {
        if (err) return;

        for (var instanceID in nodes) {
          var node = nodes[instanceID];
          var name = node.name;
          if (!name) name = "noname_" + idxNodes++;
          myNodesByNameFromMap[name] = node;
        }

        // 'RootNode' (FBX) ou 'root' (OBJ / modèle simple)
        rootNodeTree = myNodesByNameFromMap["RootNode"];
        if (rootNodeTree === undefined) rootNodeTree = myNodesByNameFromMap["root"];

        if (rootNodeTree != undefined) {
          recurse(rootNodeTree, rootNodeTree.children.length, 0);
          generateTree();
        }

        sketchfabApi = api;

        // Cases à cocher : afficher / masquer les calques 3D
        var layerCheckboxes = document.getElementsByClassName("layer-checkbox");
        for (let i = 0; i < layerCheckboxes.length; i++) {
          layerCheckboxes[i].addEventListener("change", function () {
            var isChecked = this.checked;
            var instanceId = this.value;

            setVisible(api, instanceId, isChecked);
            if (isChecked) ensureParentsVisible(this, api);

            // Sous-calques : ils suivent l'état de leur dossier
            var childContainer = document.getElementById(instanceId);
            if (childContainer) {
              var childCheckboxes = childContainer.getElementsByClassName("layer-checkbox");
              for (let j = 0; j < childCheckboxes.length; j++) {
                childCheckboxes[j].checked = isChecked;
                setVisible(api, childCheckboxes[j].value, isChecked);
              }
            }
          });
        }
      });
    });
  });
};

client.init(uid, {
  success: success,
  error: error,
  autostart: 1,
  preload: 1,
  autospin: autoSpin,
  transparent: 1,
  ui_annotations: 0, // masque la barre d'annotations de Sketchfab (remplacée par #vues-bar)
  ui_infos: 0 // titre/auteur déjà affichés dans l'en-tête de la page (mettre 1 pour les rétablir)
});

// ----------------------------- BARRE DES VUES PANORAMIQUES -------------------
function initBarreVues(api) {
  var bar = document.getElementById("vues-bar");
  if (!bar) return;
  var label = document.getElementById("vues-label");
  var prev = document.getElementById("vues-prev");
  var next = document.getElementById("vues-next");
  var TEXTE = label.textContent; // texte par défaut, écrit dans le HTML

  api.getAnnotationList(function (err, list) {
    if (err || !list || !list.length) return;
    var courant = -1;
    bar.style.display = "flex";

    function aller(i) {
      courant = (i + list.length) % list.length;
      api.gotoAnnotation(courant);
    }
    prev.onclick = function () { aller(courant < 0 ? list.length - 1 : courant - 1); };
    next.onclick = function () { aller(courant + 1); };

    api.addEventListener("annotationSelect", function (i) {
      courant = i;
      var nom = (i >= 0 && list[i] && list[i].name) ? list[i].name : "";
      label.textContent = nom ? nom.replace(MOJIBAKE, "\u00e9") : TEXTE;
    });
  });
}

// ----------------------------- BOUTONS TOUT AFFICHER / MASQUER ---------------
function setAll(visible) {
  var cbs = document.getElementsByClassName("layer-checkbox");
  for (var i = 0; i < cbs.length; i++) {
    if (cbs[i].checked !== visible) {
      cbs[i].checked = visible;
      cbs[i].dispatchEvent(new Event("change"));
    }
  }
}
var btnOn = document.getElementById("btn-tout-afficher");
var btnOff = document.getElementById("btn-tout-masquer");
if (btnOn) btnOn.addEventListener("click", function () { setAll(true); });
if (btnOff) btnOff.addEventListener("click", function () { setAll(false); });

// ----------------------------- ARBORESCENCE ----------------------------------
function generateTree() {
  var tree = unflatten(officialNodes);

  appliquerRenommages(tree); // noms affichés définis dans le HTML (RENOMMER_CALQUES)
  applyCustomGroups(tree); // dossiers définis dans le HTML (GROUPES_CALQUES)
  sortTree(tree);          // ordre défini dans le HTML (ORDRE_CALQUES / ORDRE_SOUS_CALQUES)
  if (urlParams.has("noms")) afficherNomsModele(tree);

  var navTree = document.getElementById("navTree");
  navTree.appendChild(to_ul(tree, "myUL"));

  var toggler = document.getElementsByClassName("caret");
  for (var i = 0; i < toggler.length; i++) {
    toggler[i].addEventListener("click", function () {
      this.parentElement.querySelector(".nested").classList.toggle("active");
      this.classList.toggle("caret-down");
    });
    if (DOSSIERS_OUVERTS) {
      toggler[i].parentElement.querySelector(".nested").classList.add("active");
      toggler[i].classList.add("caret-down");
    }
  }

  // Compteur dans l'en-tête
  var total = 0;
  var cbs = document.getElementsByClassName("layer-checkbox");
  for (var k = 0; k < cbs.length; k++) if (!isVirtualId(cbs[k].value)) total++;
  var compteur = document.getElementById("compteur");
  if (compteur) compteur.textContent = total + " calques";
}

function unflatten(arr) {
  var tree = [], mappedArr = {}, arrElem, mappedElem;
  for (var i = 0, len = arr.length; i < len; i++) {
    arrElem = arr[i];
    mappedArr[arrElem.instanceID] = arrElem;
    mappedArr[arrElem.instanceID].children = [];
  }
  for (var id in mappedArr) {
    if (mappedArr.hasOwnProperty(id)) {
      mappedElem = mappedArr[id];
      if (mappedElem.parentID) {
        mappedArr[mappedElem.parentID].children.push(mappedElem);
      } else {
        tree.push(mappedElem);
      }
    }
  }
  return tree;
}

// Affiche un calque sous un autre nom (RENOMMER_CALQUES : nom du modèle -> nom affiché)
function appliquerRenommages(list) {
  var keys = Object.keys(RENOMMER_CALQUES);
  list.forEach(function (n) {
    for (var i = 0; i < keys.length; i++) {
      if (memeNom(keys[i], n.name)) { n.label = RENOMMER_CALQUES[keys[i]]; break; }
    }
    if (n.children && n.children.length) appliquerRenommages(n.children);
  });
}

// Crée les dossiers "virtuels" demandés dans GROUPES_CALQUES (niveau principal)
function applyCustomGroups(tree) {
  GROUPES_CALQUES.forEach(function (g, gi) {
    var wanted = g.calques || [];
    var found = [];
    tree.forEach(function (n, idx) {
      var w = trouverIndex(wanted, n.name);
      if (w > -1) {
        n.label = wanted[w]; // on affiche le nom écrit dans le HTML (avec accents)
        found.push({ node: n, idx: idx });
      }
    });
    if (!found.length) return;

    var insertAt = found[0].idx; // le dossier prend la place du premier calque trouvé
    var members = found.map(function (f) { return f.node; });
    members.forEach(function (m) { tree.splice(tree.indexOf(m), 1); });

    // On respecte l'ordre de la liste "calques" du dossier
    members.sort(function (a, b) {
      return trouverIndex(wanted, a.name) - trouverIndex(wanted, b.name);
    });

    tree.splice(insertAt, 0, {
      name: g.nom || "DOSSIER " + (gi + 1),
      type: "Folder",
      instanceID: "dossier_" + gi,
      isParent: true,
      parentID: 0,
      children: members
    });
  });
}

// Trie chaque niveau :
//  - niveau principal : ORDRE_CALQUES
//  - sous-calques d'un parent : ORDRE_SOUS_CALQUES["nom du parent"] s'il existe,
//    sinon ORDRE_CALQUES. Les calques non listés restent à la suite (ordre du modèle).
function ordrePour(parentName) {
  if (parentName) {
    var keys = Object.keys(ORDRE_SOUS_CALQUES);
    for (var i = 0; i < keys.length; i++) {
      if (memeNom(keys[i], parentName)) return ORDRE_SOUS_CALQUES[keys[i]];
    }
  }
  return ORDRE_CALQUES;
}
function sortTree(list, parentName) {
  list.forEach(function (n) {
    if (n.children && n.children.length) sortTree(n.children, n.label || n.name);
  });
  var ordre = ordrePour(parentName);
  if (!ordre.length) return;
  var decorated = list.map(function (n, i) {
    var r = trouverIndex(ordre, n.name);
    if (r < 0 && n.label) r = trouverIndex(ordre, n.label);
    return { n: n, i: i, r: r < 0 ? 1e6 : r };
  });
  decorated.sort(function (a, b) {
    return a.r !== b.r ? a.r - b.r : a.i - b.i;
  });
  decorated.forEach(function (d, i) { list[i] = d.n; });
}

// Mode "?noms" : affiche la liste réelle des calques du modèle, à copier dans le HTML
function afficherNomsModele(tree) {
  var lignes = [];
  (function walk(list, niveau) {
    list.forEach(function (n) {
      lignes.push(new Array(niveau + 1).join("    ") + libelle(n));
      if (n.children && n.children.length) walk(n.children, niveau + 1);
    });
  })(tree, 0);
  var pre = document.createElement("pre");
  pre.style.cssText = "margin-top:12px;padding:10px;font-size:12px;white-space:pre-wrap;user-select:all;" +
    "background:rgba(0,0,0,.4);border-radius:10px;color:#cdd6e4;max-height:200px;overflow:auto";
  pre.textContent = lignes.join("\n");
  var foot = document.querySelector(".panel-foot");
  if (foot) foot.parentNode.insertBefore(pre, foot);
  console.log("Calques du modèle :\n" + lignes.join("\n"));
}

/**********************
  GENERATE HTML UL TREE
**********************/
function to_ul(branches, setID, setClass) {
  setID = setID || "";
  setClass = setClass || "";
  var outerul = document.createElement("ul");
  var lengthOfName = 45;
  var isRoot = setID === "myUL";

  if (setID != "") outerul.id = setID;
  if (setClass != "") outerul.className = setClass;

  for (var i = 0, n = branches.length; i < n; i++) {
    var branch = branches[i];
    var li = document.createElement("li");

    // Onglet principal : classe de repérage + couleur propre
    if (isRoot) {
      li.className = "calque calque-" + slug(branch.name);
      li.setAttribute("data-name", branch.name);
      li.style.setProperty("--c", couleurPour(libelle(branch), i));
    }

    var fullName = libelle(branch);
    var text = fullName;
    if (text.length > lengthOfName) text = text.substring(0, lengthOfName) + "...";

    var sp = document.createElement("span");
    sp.className = branch.isParent ? "caret" : "caret_child";
    sp.title = fullName;
    sp.appendChild(document.createTextNode(text));

    if (isArbresRemarquables(branch.name)) {
      sp.appendChild(createInfoLink(LIEN_ARBRES_REMARQUABLES));
    }

    li.appendChild(sp);
    li.appendChild(createCheckbox(branch.instanceID, branch.name));

    if (branch.children) {
      li.appendChild(to_ul(branch.children, branch.instanceID, "nested"));
    }

    outerul.appendChild(li);
  }
  return outerul;
}

function createCheckbox(instance, name) {
  var cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "layer-checkbox";
  cb.id = "check_" + instance;
  cb.value = instance;
  cb.checked = true; // Par défaut, tous les calques sont visibles
  cb.title = "Cocher pour afficher, décocher pour masquer";
  return cb;
}

function recurse(nodeTree, childCount, theParentID) {
  if (typeof nodeTree != "undefined") {
    for (var i = 0; i < childCount; i++) {
      var node = {
        name: nodeTree.children[i].name,
        type: nodeTree.children[i].type,
        instanceID: nodeTree.children[i].instanceID,
        isParent: false,
        parentID: theParentID
      };

      if (node.type == "MatrixTransform") {
        node.isParent = isParent(nodeTree.children[i].children);
        officialNodes.push(node);
        recurse(nodeTree.children[i], nodeTree.children[i].children.length, nodeTree.children[i].instanceID);
      }
    }
  }
}

function isParent(children) {
  for (var i = 0; i < children.length; i++) {
    if (children[i].type == "MatrixTransform") return true;
  }
  return false;
}
