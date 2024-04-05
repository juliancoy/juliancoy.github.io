document.querySelectorAll('#navbar a').forEach(link => {
    link.onclick = function(e) {
        e.preventDefault();

        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    };
});
