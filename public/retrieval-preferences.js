(function (root, factory) {
 const api = factory();
 if (typeof module === "object" && module.exports) module.exports = api;
 else root.RetrievalPreferences = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
 function normalize(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if (typeof value.programming_language !== "string") return {};
  let language = value.programming_language.trim().toLowerCase();
  if (language === "c++") language = "cpp";
  if (language === "c#") language = "csharp";
  return language.length <= 64 && /^[a-z][a-z0-9_-]*$/.test(language) ? { programming_language: language } : {};
 }
 function resolve(request, saved) {
  return normalize(Object.prototype.hasOwnProperty.call(request || {}, "retrieval_preferences") ? request.retrieval_preferences : saved);
 }
 return { normalize, resolve };
});
