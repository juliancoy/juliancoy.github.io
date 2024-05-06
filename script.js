document.querySelectorAll('#navbar a').forEach(link => {
    link.onclick = function(e) {
        e.preventDefault();

        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    };
});
function hideTextOfOtherTiles(e){
    console.log(e.target.dataset.tile)
    document.querySelectorAll('.tile').forEach(tile => {
        if(tile.dataset.tile !== e.target.dataset.tile){
            tile.classList.add('hide-text')
            tile.classList.remove('show-text')
        }
    })
}
function showTextOfAllTiles(){
    document.querySelectorAll('.tile').forEach(tile => {
        tile.classList.remove('hide-text')
        tile.classList.add('show-text')
    })
}
document.querySelectorAll('.tile').forEach(tile => {
    tile.addEventListener('mouseenter', function(e){
        tile.classList.add('grow')
        tile.classList.remove('shrink')
        hideTextOfOtherTiles(e)
    })
    tile.addEventListener('mouseleave', function(){
        tile.classList.remove('grow')
        tile.classList.add('shrink')
        this.querySelector('.content').classList.remove('selected')
        this.querySelectorAll('.iframe-overlay').forEach(overlay => {
            overlay.classList.remove('hide')
        })
        showTextOfAllTiles()
    })
})
document.querySelectorAll('.project').forEach(project => {
    project.addEventListener('click', function(){
        project.classList.remove('hide-project-content')
        project.classList.add('show-project-content')
    })
})
document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('click', function(e){
        e.stopPropagation()
        btn.parentElement.classList.add('hide-project-content')
        btn.parentElement.classList.add('test')
        btn.parentElement.classList.remove('show-project-content')
    })
})
document.querySelectorAll('.talks-tile .iframe-container').forEach(iframe => {
    iframe.addEventListener('click', function(e){
        console.log("iframe clicked")
        e.target.parentElement.parentElement.classList.add('selected')
        e.target.parentElement.querySelector('.iframe-overlay').classList.add('hide')
    })
})