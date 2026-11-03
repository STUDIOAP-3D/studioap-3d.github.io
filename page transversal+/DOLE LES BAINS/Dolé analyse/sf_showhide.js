// =============================================================================
// CONFIGURATION DU LIEN "INFO" (Arbres remarquables)
// =============================================================================
// Lien vers la page HTML de votre choix pour l'icône "info" :
var LIEN_ARBRES_REMARQUABLES = window.LIEN_ARBRES_REMARQUABLES || "page_arbres_remarquables.html";

// Fonction de détection du calque "arbres remarquables" (insensible à la casse, accents, tirets)
function isArbresRemarquables(name) {
  if (!name || typeof name !== "string") return false;
  var clean = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-]+/g, " ");
  return clean.includes("arbre") && clean.includes("remarquable");
}

// Création de l'icône SVG cliquable menant vers la page HTML
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

  // Empêche le clic d'ouvrir/fermer le dossier déroulant si c'est un parent
  a.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  return a;
}

// Fonction pour s'assurer que les calques parents sont visibles lorsqu'un enfant est coché
function ensureParentsVisible(checkbox, apiInstance) {
  var currentApi = apiInstance || sketchfabApi;
  var current = checkbox.closest("ul.nested");
  while (current && current.id) {
    var parentCb = document.getElementById("check_" + current.id);
    if (parentCb && !parentCb.checked) {
      parentCb.checked = true;
      if (currentApi && currentApi.show) {
        currentApi.show(parentCb.value);
      }
    }
    current = current.parentElement ? current.parentElement.closest("ul.nested") : null;
  }
}

// Sketchfab Viewer API: Start/Stop the viewer
var version = "1.9.0";
var uid = "7981adb558264af0aad9472923a91eb8";
var sketchfabApi = null;

var urlParams = new URLSearchParams(window.location.search);
var autoSpin = 0.0;

if (urlParams.has("autospin")) {
  autoSpin = urlParams.get("autospin");
}

if (urlParams.has("id")) {
  uid = urlParams.get("id");
}

var iframe = document.getElementById("api-frame");
var client = new window.Sketchfab(version, iframe);
var treeText = "";

var error = function () {
  console.error("Sketchfab API error");
};

//var myNodesByNameFromGraph = {};
var idxNodes = 0;
var myNodesByNameFromMap = {};
var officialNodes = [];

var objectID = -1;

/*
var computeAssociativeArray = function(node){
		if (!node)  return;
    var name = node.name;
    if (!name) name = "noname_" + idxNodes++;       
                debugger;         		
    myNodesByNameFromGraph[name] = node;
    if (!node.children || !node.children.length) return;
  	for (var i = 0; i < node.children.length; i++){
  		computeAssociativeArray(node.children[i]);    
  	}
}
*/

var success = function (api) {
  api.start(function () {
    api.addEventListener("viewerready", function () {
      /*
          api.getSceneGraph(function (err, result) {
                if (err) {
                    console.log('-------Scene Graph--------------')
                    console.log('Error getting nodes');
                    return;
                }
                // get the id from that log
                //console.log(result);
              computeAssociativeArray(result);
                console.log("nodes indexed by names from scene node graph");
                console.log(myNodesByNameFromGraph);
            });
            */

      api.getNodeMap(function (err, nodes) {
        if (!err) {
          for (var instanceID in nodes) {
            var node = nodes[instanceID];
            var name = node.name;
            if (!name) name = "noname_" + idxNodes++;
            myNodesByNameFromMap[name] = node;
          }
          //console.log("nodes indexed by names from flattened array");
          //console.log(myNodesByNameFromMap);

          //attempt to look for a 'RootNode' - this seems to be present for FBX uploaded models
          rootNodeTree = myNodesByNameFromMap["RootNode"];

          if(rootNodeTree === undefined){
            //attempt to look for a 'root' - this seems to be present for OBJ or single object models
            rootNodeTree = myNodesByNameFromMap["root"];
          }

          if(rootNodeTree != undefined){

            recurse(rootNodeTree, rootNodeTree.children.length, 0);
            //console.log(officialNodes);

            //Now we can build the tree for the UI
            generateTree();
           } 

          sketchfabApi = api;

          // Gestion des cases à cocher pour afficher / masquer les calques 3D
          var layerCheckboxes = document.getElementsByClassName("layer-checkbox");
          for (let i = 0; i < layerCheckboxes.length; i++) {
            layerCheckboxes[i].addEventListener("change", function () {
              var isChecked = this.checked;
              var instanceId = this.value;

              if (isChecked) {
                api.show(instanceId);
                // Si ce sous-calque est dans un groupe parent, on s'assure que le parent est affiché
                ensureParentsVisible(this, api);
              } else {
                api.hide(instanceId);
              }

              // Gestion des sous-calques éventuels (enfants situés dans l'élément <ul id="instanceId">)
              var childContainer = document.getElementById(instanceId);
              if (childContainer) {
                var childCheckboxes = childContainer.getElementsByClassName("layer-checkbox");
                for (let j = 0; j < childCheckboxes.length; j++) {
                  childCheckboxes[j].checked = isChecked;
                  if (isChecked) {
                    api.show(childCheckboxes[j].value);
                  } else {
                    api.hide(childCheckboxes[j].value);
                  }
                }
              }
            });
          }
        }
      });
      /*  
        document.getElementById('screenshot').addEventListener('click', function () {
           api.getScreenShot(800, 800, 'image/png', function (err, result) {
           if (!err) {
             var anchor = document.createElement('a');
             anchor.href = result;
             anchor.download = 'screenshot.png';
             anchor.innerHTML = '<img width="100" height="100" src=' + result + '>';
             document.getElementById('navTree').appendChild(anchor);
            }
          });
        });
        */

      /*
            document.getElementById('show').addEventListener('click', function () {
                api.show(id);
            });
            
            */
    });
  });
};
client.init(uid, {
  success: success,
  error: error,
  autostart: 1,
  preload: 1,
  autospin: autoSpin,
  transparent: 1
});
//////////////////////////////////
// GUI Code
//////////////////////////////////
function initGui() {
  var controls = document.getElementById("navTree");
  var buttonsText = "";
  buttonsText += '<button id="screenshot"></button>';
  controls.innerHTML = buttonsText;
}
//initGui();

function generateTree() {
  //console.log("Total Node Count: " + officialNodes.length);

  var tree = unflatten(officialNodes);
  //console.log(tree);

  //Create the HTML UL elemenet of the objects
  var navTree = document.getElementById("navTree");
  navTree.appendChild(to_ul(tree, "myUL"));

  var toggler = document.getElementsByClassName("caret");
  var i;

  for (i = 0; i < toggler.length; i++) {
    toggler[i].addEventListener("click", function () {
      this.parentElement.querySelector(".nested").classList.toggle("active");
      this.classList.toggle("caret-down");
    });
  }
}

function unflatten(arr) {
  var tree = [],
    mappedArr = {},
    arrElem,
    mappedElem;

  // First map the nodes of the array to an object -> create a hash table.
  for (var i = 0, len = arr.length; i < len; i++) {
    arrElem = arr[i];
    mappedArr[arrElem.instanceID] = arrElem;
    mappedArr[arrElem.instanceID].children = [];
  }

  for (var id in mappedArr) {
    if (mappedArr.hasOwnProperty(id)) {
      mappedElem = mappedArr[id];
      // If the element is not at the root level, add it to its parent array of children.
      if (mappedElem.parentID) {
        mappedArr[mappedElem.parentID].children.push(mappedElem);
      }
      // If the element is at the root level, add it to first level elements array.
      else {
        tree.push(mappedElem);
      }
    }
  }
  return tree;
}

/**********************
  GENERATE HTML UL TREE
**********************/
function to_ul(branches, setID = "", setClass = "") {
  var outerul = document.createElement("ul");
  var lengthOfName = 45;

  if (setID != "") {
    outerul.id = setID;
  }
  if (setClass != "") {
    outerul.className = setClass;
  }

  for (var i = 0, n = branches.length; i < n; i++) {
    var branch = branches[i];
    var li = document.createElement("li");

    var fullName = branch.name.replace(/_/g, " ");
    var text = fullName;
    if (text.length > lengthOfName) {
      text = text.substring(0, lengthOfName) + "...";
    }
    var textNode = document.createTextNode(text);

    if (branch.isParent) {
      var sp = document.createElement("span");
      sp.className = "caret";
      sp.title = fullName;

      sp.appendChild(textNode);

      // Ajout de l'icône info sur la ligne "arbres remarquables"
      if (isArbresRemarquables(branch.name)) {
        sp.appendChild(createInfoLink(LIEN_ARBRES_REMARQUABLES));
      }

      li.appendChild(sp);
      li.appendChild(createCheckbox(branch.instanceID, branch.name));
    } else {
      var sp2 = document.createElement("span");
      sp2.className = "caret_child";
      sp2.title = fullName;

      sp2.appendChild(textNode);

      // Ajout de l'icône info sur la ligne "arbres remarquables"
      if (isArbresRemarquables(branch.name)) {
        sp2.appendChild(createInfoLink(LIEN_ARBRES_REMARQUABLES));
      }

      li.appendChild(sp2);
      li.appendChild(createCheckbox(branch.instanceID, branch.name));
    }

    if (branch.children) {
      li.appendChild(to_ul(branch.children, branch.instanceID, "nested"));
    }

    outerul.appendChild(li);
  }

  console.log(outerul);
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

function createButton(btnType, instance, name) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = btnType;

  if (btnType == "Hide") {
    btn.id = instance + "_" + name + "_" + btnType;
    btn.style.backgroundColor = "green";
  } else {
    btn.id = instance + "_" + name;
  }
  btn.value = instance;
  var btnText = document.createTextNode(btnType);
  btn.appendChild(btnText);

  return btn;
}

//////////////////////////////////
// GUI Code end
//////////////////////////////////

function recurse(nodeTree, childCount, theParentID) {
  if (typeof nodeTree != "undefined") {
    //Process the children of this node tree
    for (var i = 0; i < childCount; i++) {
      var node = {
        name: nodeTree.children[i].name,
        type: nodeTree.children[i].type,
        instanceID: nodeTree.children[i].instanceID,
        isParent: false,
        parentID: theParentID
      };

      if (node.type == "MatrixTransform") {
        //Determine if this node is a parent
        node.isParent = isParent(nodeTree.children[i].children);

        console.log(
          "   " +
            node.name +
            "(Node Type:" +
            node.type +
            ")" +
            "(Instance ID: " +
            node.instanceID +
            ")" +
            "(Is Parent: " +
            node.isParent +
            ")" +
            "(Parent ID: " +
            node.parentID +
            ")" +
            " Child Count :" +
            nodeTree.children[i].children.length
        );

        //Add this node to the complete node array list we are constructing
        officialNodes.push(node);

        recurse(
          nodeTree.children[i],
          nodeTree.children[i].children.length,
          nodeTree.children[i].instanceID
        );
      }
    }
  }
}

function isParent(children) {
  //Look through all the children to see if a "MatrixTransform" type exists...

  var result = false;

  for (var i = 0; i < children.length; i++) {
    if (children[i].type == "MatrixTransform") {
      result = true;
      console.log("PARENT NODE DETECTED");
      break;
    } else {
      result = false;
    }
  }

  return result;
}
