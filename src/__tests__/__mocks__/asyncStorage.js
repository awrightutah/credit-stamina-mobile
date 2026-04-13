// Lightweight AsyncStorage mock for Jest
const store = {};

module.exports = {
  getItem:      jest.fn((key)        => Promise.resolve(store[key] ?? null)),
  setItem:      jest.fn((key, value) => { store[key] = value; return Promise.resolve(); }),
  removeItem:   jest.fn((key)        => { delete store[key]; return Promise.resolve(); }),
  getAllKeys:    jest.fn(()           => Promise.resolve(Object.keys(store))),
  multiRemove:  jest.fn((keys)       => { keys.forEach(k => delete store[k]); return Promise.resolve(); }),
  clear:        jest.fn(()           => { Object.keys(store).forEach(k => delete store[k]); return Promise.resolve(); }),
};
