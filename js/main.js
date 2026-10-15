document.addEventListener('DOMContentLoaded', () => {
  // Handle Routing via Hash
  const loadRoute = () => {
    let hash = window.location.hash.substring(1) || 'home';
    loadMarkdownContent(hash);
    updateActiveNav(hash);
  };

  window.addEventListener('hashchange', loadRoute);
  loadRoute();
});

async function loadMarkdownContent(page) {
  const container = document.getElementById('content');
  container.innerHTML = '<p>Loading content...</p>';

  try {
    const response = await fetch(`content/${page}.md`);
    if (!response.ok) throw new Error('Page not found');
    
    const markdownText = await response.text();
    // Parse Markdown using Marked library
    container.innerHTML = marked.parse(markdownText);
  } catch (error) {
    container.innerHTML = `
      <div class="card">
        <h1>404 - Page Not Found</h1>
        <p>Sorry, the page you are looking for does not exist.</p>
        <a href="#home" class="btn">Return Home</a>
      </div>`;
  }
}

function updateActiveNav(page) {
  document.querySelectorAll('.nav-links a').forEach(link => {
    if (link.getAttribute('href') === `#${page}`) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}
